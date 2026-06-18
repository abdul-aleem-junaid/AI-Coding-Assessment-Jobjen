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
    // `displaySurface: "monitor"` is only a HINT — the browser still lets the
    // user pick a tab/window — so we validate the actual choice below. The
    // other hints nudge the picker toward whole-screen and away from offering
    // "this tab".
    video: { frameRate: 10, displaySurface: "monitor" },
    audio: false,
    monitorTypeSurfaces: "include",
    surfaceSwitching: "exclude",
    selfBrowserSurface: "exclude",
  });

  // Enforce a FULL-SCREEN share. "monitor" = an entire display; "window" or
  // "browser" (a single app window / tab) would leave the rest of the screen
  // unmonitored, defeating the proctoring. We can only reject when the browser
  // reports the surface (Chromium does; some browsers don't) — when it's
  // unknown we allow it rather than block a candidate on a capability gap.
  const track = stream.getVideoTracks()[0];
  const surface = track?.getSettings?.().displaySurface;
  if (surface && surface !== "monitor") {
    stream.getTracks().forEach((t) => t.stop());
    const err = new Error("ENTIRE_SCREEN_REQUIRED");
    err.code = "ENTIRE_SCREEN_REQUIRED";
    throw err;
  }
  return stream;
}

export class ScreenRecorder {
  constructor({ sessionId, screenStream, micStream, onLost }) {
    this.sessionId = sessionId;
    this.screenStream = screenStream;
    this.micStream = micStream;
    // Called once if the screen share ends mid-session (candidate clicks "Stop
    // sharing" / OS revoke) or the recorder errors. The assessment page uses it
    // to block the UI and force a re-share.
    this.onLost = onLost;

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
    this.lostNotified = false;

    // Backpressure (M13): on a slow uplink, captured chunks pile up faster than
    // they upload and the buffered Blob chain grows without bound — the tab can
    // OOM and finalize stalls. We cap how many parts may be queued/in-flight and
    // PAUSE capture while the backlog is deep, resuming once it drains. A short
    // capture gap on a struggling connection beats crashing the assessment.
    this.maxInFlightParts = 3;
    this.inFlightParts = 0;
    this.paused = false;

    // Runaway-recording cap (M14): bounds a single recording segment's size on
    // an untimed question (timed ones are already bounded by the H8 deadline
    // auto-submit). On hit, we treat it like a share-loss so the page forces a
    // fresh re-share (a new, separate upload). Generous so it never fires in a
    // normal assessment.
    this.maxDurationMs = 3 * 60 * 60 * 1000;
    this.maxDurationTimer = null;
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

    // Detect the candidate ending the screen share (browser "Stop sharing"
    // pill / OS revoke) or a recorder failure. We must NOT silently continue
    // unrecorded — onLost lets the assessment page pause and force a re-share.
    const screenTrack = this.screenStream.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.addEventListener("ended", () =>
        this._notifyLost("screen-share-ended"),
      );
    }
    this.recorder.onerror = () => this._notifyLost("recorder-error");

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
    this.maxDurationTimer = setTimeout(
      () => this._notifyLost("max-duration"),
      this.maxDurationMs,
    );
  }

  _enqueueFlush(isFinal) {
    this.inFlightParts += 1;
    this._applyBackpressure();
    this.chain = this.chain
      .then(() => this._flush(isFinal))
      .catch((err) => {
        this.failed = true;
        // Swallow so the chain keeps resolving; surfaced via this.failed.
        console.error("[screenRecorder] part upload failed permanently:", err);
        // Warn the candidate (and let them recover) instead of silently
        // submitting a truncated recording. No-op once stopped (during submit).
        this._notifyLost("upload-failed");
      })
      .finally(() => {
        this.inFlightParts -= 1;
        this._applyBackpressure();
      });
    return this.chain;
  }

  /**
   * Pause capture while the upload backlog is too deep, resume once it drains
   * (M13). No-op during/after stop (the final tail flush must not pause) and
   * when the recorder isn't actively recording.
   */
  _applyBackpressure() {
    if (this.stopped || !this.recorder) return;
    const overloaded = this.inFlightParts >= this.maxInFlightParts;
    try {
      if (overloaded && !this.paused && this.recorder.state === "recording") {
        this.recorder.pause();
        this.paused = true;
      } else if (!overloaded && this.paused && this.recorder.state === "paused") {
        this.recorder.resume();
        this.paused = false;
      }
    } catch {
      /* pause/resume unsupported — fall back to unbounded (prior behaviour) */
    }
  }

  async _flush(isFinal) {
    if (!isFinal && this.pendingBytes < this.partSize) return;
    if (this.pending.length === 0) return;

    const blob = new Blob(this.pending, { type: this.mimeType });
    this.pending = [];
    this.pendingBytes = 0;

    const partNumber = this.partNumber++;
    await this._uploadPartWithRetry(partNumber, blob);
  }

  /**
   * Upload ONE part, with bounded retries + exponential backoff. A transient
   * failure (network blip, 5xx, or a presigned URL that EXPIRED while earlier
   * parts drained ahead of this one) must not poison the whole recording: the
   * server keeps only the contiguous run from part 1, so a single dropped
   * mid-stream part would otherwise truncate everything after it. We re-mint a
   * FRESH presigned URL on every attempt so an expired URL self-heals.
   */
  async _uploadPartWithRetry(partNumber, blob) {
    const MAX_ATTEMPTS = 5;
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // Fresh presigned URL each attempt (handles an expired one).
        const urlRes = await api.post("/technical/screen/multipart/part-url", {
          sessionId: this.sessionId,
          partNumber,
        });
        const uploadUrl = urlRes.data?.uploadUrl;
        if (!uploadUrl) throw new Error("No upload URL returned for part.");

        // Direct PUT to S3 — outside the crypto axios. Read the ETag the
        // server needs to assemble the object (requires S3 CORS to expose it).
        const put = await fetch(uploadUrl, { method: "PUT", body: blob });
        if (!put.ok) throw new Error(`S3 part PUT failed (HTTP ${put.status})`);
        const etag = put.headers.get("ETag") ?? put.headers.get("etag");
        if (!etag) {
          throw new Error("S3 did not return an ETag (check CORS expose).");
        }

        await api.post("/technical/screen/multipart/part-done", {
          sessionId: this.sessionId,
          partNumber,
          etag,
          size: blob.size,
        });
        return; // success
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          // Backoff between the 5 attempts: 0.5s, 1s, 2s, 4s.
          const delayMs = Math.min(4000, 500 * 2 ** (attempt - 1));
          console.warn(
            `[screenRecorder] part ${partNumber} attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${delayMs}ms`,
            err,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw new Error(
      `Part ${partNumber} failed after ${MAX_ATTEMPTS} attempts: ${
        lastErr && lastErr.message ? lastErr.message : "unknown error"
      }`,
    );
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
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    const durationSec = this.startedAt
      ? (Date.now() - this.startedAt) / 1000
      : 0;

    // Make sure a backpressure pause doesn't strand the tail: resume so the
    // final dataavailable fires before we stop the recorder.
    if (this.recorder && this.recorder.state === "paused") {
      try {
        this.recorder.resume();
      } catch {
        /* ignore */
      }
      this.paused = false;
    }

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

  /** Fire the onLost callback exactly once (ignored after a deliberate stop). */
  _notifyLost(reason) {
    if (this.stopped || this.lostNotified) return;
    this.lostNotified = true;
    try {
      if (this.onLost) this.onLost(reason);
    } catch {
      /* ignore */
    }
  }

  /**
   * Permanently disarm this recorder. Used when replacing it on a re-share:
   * makes _notifyLost() and stop() inert so stopping the OLD (dead) screen
   * tracks can't re-trigger the "recording lost" flow on the instance we're
   * discarding.
   */
  dispose() {
    this.stopped = true;
    this.onLost = null;
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }
}
