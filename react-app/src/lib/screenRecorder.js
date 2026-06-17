// src/lib/screenRecorder.js
//
// Captures the candidate's SCREEN (getDisplayMedia) + microphone audio into one
// MediaRecorder stream, and streams it to S3 as an S3 multipart upload while the
// assessment runs. Mirrors the AI-interview webcam client: init → (part-url →
// PUT to S3 → part-done)* → complete. Uploading progressively keeps memory flat
// for long recordings and means the recording survives even if submit is slow.
//
// S3 rule: every part except the LAST must be >= 5 MB. We buffer MediaRecorder
// chunks until we cross `partSize`, flush them as one part, and on stop upload
// whatever remains as the final (small-allowed) part.

import api from "./api";

const PREFERRED_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  for (const t of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return "video/webm";
}

/**
 * Prompt the candidate to share their screen. MUST be called from a user
 * gesture (e.g. a button click). Returns the screen MediaStream.
 */
export async function acquireScreenStream() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 10 },
    audio: false,
  });
  return stream;
}

export class ScreenRecorder {
  constructor({ sessionId, screenStream, micStream }) {
    this.sessionId = sessionId;
    this.screenStream = screenStream;
    this.micStream = micStream;

    this.recorder = null;
    this.mimeType = pickMimeType();
    this.partSize = 5 * 1024 * 1024;
    this.partNumber = 1; // 1-based; set from init's nextPartNumber
    this.pending = [];
    this.pendingBytes = 0;
    this.chain = Promise.resolve(); // serializes part uploads
    this.startedAt = 0;
    this.stopped = false;
    this.failed = false;
  }

  /** Init the multipart upload and start recording. */
  async start() {
    const init = await api.post("/technical/screen/multipart/init", {
      sessionId: this.sessionId,
      contentType: this.mimeType,
    });
    const data = init.data ?? {};
    if (data.alreadyComplete) {
      // A recording was already finalized for this session (resume after a
      // prior submit attempt) — nothing to record.
      this.stopped = true;
      return;
    }
    this.partSize = data.partSize ?? this.partSize;
    this.partNumber = data.nextPartNumber ?? 1;

    const combined = new MediaStream([
      ...this.screenStream.getVideoTracks(),
      ...this.micStream.getAudioTracks(),
    ]);

    this.recorder = new MediaRecorder(combined, { mimeType: this.mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.pending.push(e.data);
        this.pendingBytes += e.data.size;
        if (!this.stopped && this.pendingBytes >= this.partSize) {
          this._enqueueFlush(false);
        }
      }
    };
    this.startedAt = Date.now();
    // 4s timeslice so chunks arrive steadily and we can upload mid-session.
    this.recorder.start(4000);
  }

  _enqueueFlush(isFinal) {
    this.chain = this.chain.then(() => this._flush(isFinal)).catch((err) => {
      this.failed = true;
      // Swallow so the chain keeps resolving; surfaced via this.failed.
      console.error("[screenRecorder] part upload failed:", err);
    });
    return this.chain;
  }

  async _flush(isFinal) {
    if (!isFinal && this.pendingBytes < this.partSize) return;
    if (this.pending.length === 0) return;

    const blob = new Blob(this.pending, { type: this.mimeType });
    this.pending = [];
    this.pendingBytes = 0;

    const partNumber = this.partNumber++;
    const urlRes = await api.post("/technical/screen/multipart/part-url", {
      sessionId: this.sessionId,
      partNumber,
    });
    const uploadUrl = urlRes.data?.uploadUrl;
    if (!uploadUrl) throw new Error("No upload URL returned for part.");

    // Direct PUT to S3 — outside the crypto axios. Read the ETag the server
    // needs to assemble the object (requires S3 CORS to expose ETag).
    const put = await fetch(uploadUrl, { method: "PUT", body: blob });
    if (!put.ok) throw new Error(`S3 part PUT failed (HTTP ${put.status})`);
    const etag = put.headers.get("ETag") ?? put.headers.get("etag");
    if (!etag) throw new Error("S3 did not return an ETag (check CORS expose).");

    await api.post("/technical/screen/multipart/part-done", {
      sessionId: this.sessionId,
      partNumber,
      etag,
      size: blob.size,
    });
  }

  /**
   * Stop recording, flush the tail part, and finalize the S3 object.
   * Returns { durationSec, completed }.
   */
  async stop() {
    if (this.stopped) {
      return { durationSec: 0, completed: false };
    }
    this.stopped = true;
    const durationSec = this.startedAt
      ? (Date.now() - this.startedAt) / 1000
      : 0;

    // Stop the recorder and wait for the final dataavailable + onstop.
    if (this.recorder && this.recorder.state !== "inactive") {
      await new Promise((resolve) => {
        this.recorder.onstop = () => resolve();
        try {
          this.recorder.stop();
        } catch {
          resolve();
        }
      });
    }

    // Stop the screen tracks (the mic track belongs to the shared preflight
    // stream and is stopped by App on unmount).
    this.screenStream?.getTracks().forEach((t) => t.stop());

    // Upload the tail (last part may be < 5 MB) and wait for all parts.
    await this._enqueueFlush(true);
    await this.chain;

    if (this.failed) {
      throw new Error("One or more recording chunks failed to upload.");
    }

    await api.post("/technical/screen/multipart/complete", {
      sessionId: this.sessionId,
      durationSec,
    });

    return { durationSec, completed: true };
  }
}
