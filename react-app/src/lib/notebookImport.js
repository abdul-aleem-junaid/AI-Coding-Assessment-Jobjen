// src/lib/notebookImport.js
//
// Seeds the question's attachment files INTO the JupyterLite workspace so the
// candidate sees them in the file browser (and the starter notebook opens
// automatically). Mirror of notebookExport.js: the parent fetches each file
// from its presigned S3 URL, then postMessages the bytes to the iframe, where
// an injected hook (scripts/patch-build.cjs "Patch 9") writes them via the
// Contents API.
//
// NOTE: fetching the presigned download URLs is a cross-origin GET to S3, so the
// bucket's CORS must allow GET from this app's origin.

import { getNotebookWindow } from "./notebookExport";

function abToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** Wait until NotebookFrame has registered the iframe window. */
function waitForWindow(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const win = getNotebookWindow();
      if (win) return resolve(win);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("Notebook frame did not load in time."));
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

/**
 * One import attempt: wait for the frame, download each presigned file, then
 * postMessage the bytes to the iframe — resolving when the in-iframe hook acks,
 * or rejecting on a download failure, an ack error, or a timeout.
 */
async function importOnce(files, open) {
  const win = await waitForWindow();

  const payload = [];
  for (const f of files) {
    if (!f?.downloadUrl) continue;
    const res = await fetch(f.downloadUrl);
    if (!res.ok) {
      throw new Error(`Failed to download "${f.name}" (HTTP ${res.status}).`);
    }
    const buf = await res.arrayBuffer();
    payload.push({
      name: (f.name || "file").split("/").pop(),
      base64: abToB64(buf),
      mime: f.mimeType || "",
    });
  }
  if (payload.length === 0) return { imported: 0 };

  return new Promise((resolve, reject) => {
    const id =
      (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now() + Math.random());

    const onMessage = (e) => {
      if (e.source !== win) return;
      const d = e.data;
      if (!d || d.type !== "jobjen:filesImported" || d.id !== id) return;
      cleanup();
      if (d.error) reject(new Error(d.error));
      else resolve({ imported: d.imported ?? payload.length });
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out importing files into the workspace."));
    }, 60000);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    win.postMessage(
      { type: "jobjen:importFiles", id, files: payload, open },
      "*",
    );
  });
}

/**
 * Wipe the JupyterLite workspace (every file/folder in the root) before seeding
 * a new session's files. The workspace lives in this origin's IndexedDB and is
 * shared across every assessment opened in this browser, so without this a
 * previous candidate's question files leak into the next one. Drives the
 * in-iframe reset bridge (scripts/patch-build.cjs "Patch 10"); resolves with the
 * count deleted, or rejects on ack-error / timeout.
 *
 * Caller contract: invoke this ONLY for a new session (different sessionId), not
 * on a resume of the same session — a resume must keep the candidate's work.
 */
export function resetWorkspace(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    waitForWindow()
      .then((win) => {
        const id =
          (crypto.randomUUID && crypto.randomUUID()) ||
          String(Date.now() + Math.random());

        const onMessage = (e) => {
          if (e.source !== win) return;
          const d = e.data;
          if (!d || d.type !== "jobjen:workspaceReset" || d.id !== id) return;
          cleanup();
          if (d.error) reject(new Error(d.error));
          else resolve({ deleted: d.deleted ?? 0 });
        };

        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Timed out resetting the workspace."));
        }, timeoutMs);

        function cleanup() {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
        }

        window.addEventListener("message", onMessage);
        win.postMessage({ type: "jobjen:resetWorkspace", id }, "*");
      })
      .catch(reject);
  });
}

/** How many times to attempt the whole import before giving up. */
const MAX_IMPORT_ATTEMPTS = 3;
/** Pause between attempts so a transient failure (frame not ready yet, flaky S3
 *  GET, dropped ack) has a moment to clear. */
const RETRY_DELAY_MS = 1000;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch the question's attachment files and import them into the JupyterLite
 * workspace. `files` is the question.files array ([{ name, downloadUrl,
 * mimeType }]). If `open` is true the iframe auto-opens the primary file.
 *
 * Retries the whole operation up to `maxAttempts` times (default 3) on failure,
 * with a short pause between tries. Only rejects after every attempt has failed.
 */
export async function importQuestionFiles(
  files,
  { open = true, maxAttempts = MAX_IMPORT_ATTEMPTS } = {},
) {
  if (!Array.isArray(files) || files.length === 0) return { imported: 0 };

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await importOnce(files, open);
    } catch (err) {
      lastErr = err;
      console.warn(
        `[notebookImport] file load attempt ${attempt}/${maxAttempts} failed:`,
        err,
      );
      if (attempt < maxAttempts) await delay(RETRY_DELAY_MS);
    }
  }
  throw lastErr;
}
