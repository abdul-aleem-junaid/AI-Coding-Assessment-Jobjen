// src/lib/notebookExport.js
//
// Parent-side bridge to pull the candidate's notebooks out of the JupyterLite
// iframe and upload each as a "solution file" to S3. The iframe runs an injected
// export hook (see scripts/patch-build.cjs "Patch 8") that answers a
// postMessage({type:'jobjen:exportNotebooks'}) with every .ipynb in the
// workspace.

import api from "./api";

let notebookWindow = null;

/** NotebookFrame registers its iframe's contentWindow here on load. */
export function registerNotebookWindow(win) {
  notebookWindow = win;
}

/** The registered JupyterLite iframe window, or null if not loaded yet. */
export function getNotebookWindow() {
  return notebookWindow;
}

/** Wait until NotebookFrame has registered the iframe window. On a page reload
 *  the iframe remounts and submit can fire before its `onLoad` registers the
 *  window — without this the export would reject immediately with "frame not
 *  ready" and the upload would fail. */
function waitForNotebookWindow(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (notebookWindow) return resolve(notebookWindow);
      if (Date.now() - start > timeoutMs) {
        return reject(new Error("Notebook frame did not load in time."));
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

/**
 * Ask the JupyterLite iframe for all workspace notebooks.
 * Resolves to [{ name, content }] (content = parsed .ipynb JSON).
 *
 * Waits for the iframe window first, then for the in-iframe export bridge —
 * which itself waits up to 30s for the workspace to boot (see patch-build.cjs
 * "Patch 8") — so an export fired right after a reload (e.g. an immediate
 * auto-submit when the deadline lapsed mid-reload) waits for the editor instead
 * of failing. The reply timeout must exceed the bridge's internal 30s wait.
 */
export function requestNotebooks(timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    waitForNotebookWindow()
      .then((win) => {
        const id =
          (crypto.randomUUID && crypto.randomUUID()) ||
          String(Date.now() + Math.random());

        const onMessage = (e) => {
          if (e.source !== win) return;
          const d = e.data;
          if (!d || d.type !== "jobjen:notebooks" || d.id !== id) return;
          cleanup();
          if (d.error && (!d.files || d.files.length === 0)) {
            reject(new Error(d.error));
            return;
          }
          resolve(Array.isArray(d.files) ? d.files : []);
        };

        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Timed out exporting notebooks from the workspace."));
        }, timeoutMs);

        function cleanup() {
          clearTimeout(timer);
          window.removeEventListener("message", onMessage);
        }

        window.addEventListener("message", onMessage);
        win.postMessage({ type: "jobjen:exportNotebooks", id }, "*");
      })
      .catch(reject);
  });
}

const IPYNB_MIME = "application/x-ipynb+json";

/** Upload one notebook to S3 via presign → PUT → complete. */
async function uploadOne(sessionId, file) {
  const name = file.name?.split("/").pop() || "notebook.ipynb";
  const body = new Blob([JSON.stringify(file.content ?? {})], {
    type: IPYNB_MIME,
  });

  const presign = await api.post("/technical/solution/presign", {
    sessionId,
    filename: name,
    contentType: IPYNB_MIME,
  });
  const { uploadUrl, key } = presign.data ?? {};
  if (!uploadUrl || !key) throw new Error("No presigned URL for solution file.");

  // Both headers MUST match what was signed (getPresignedPutUrl signs the
  // Content-Type AND ServerSideEncryption: AES256 — the bucket's
  // DenyUnencryptedObjectUploads policy rejects a PUT without the SSE header).
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": IPYNB_MIME,
      "x-amz-server-side-encryption": "AES256",
    },
    body,
  });
  if (!put.ok) throw new Error(`Solution PUT failed (HTTP ${put.status})`);

  await api.post("/technical/solution/complete", {
    sessionId,
    key,
    name,
    mimeType: IPYNB_MIME,
    size: body.size,
  });
  return { name, key, size: body.size };
}

/**
 * Upload one notebook with bounded exponential-backoff retry (M22). A single
 * transient blip (5xx, dropped wifi, expired presign) on one file used to
 * reject the WHOLE batch and bounce submit, discarding every already-uploaded
 * file's work. Each attempt re-presigns (fresh URL + key) so an expired URL
 * self-heals; the backend completes idempotently by key.
 */
async function uploadOneWithRetry(sessionId, file) {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await uploadOne(sessionId, file);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        const delayMs = Math.min(4000, 500 * 2 ** (attempt - 1));
        console.warn(
          `[notebookExport] upload of "${file.name}" attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ${delayMs}ms`,
          err,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new Error(
    `Failed to upload "${file.name}" after ${MAX_ATTEMPTS} attempts: ${
      lastErr && lastErr.message ? lastErr.message : "unknown error"
    }`,
  );
}

/**
 * Export every workspace notebook and upload them all. Returns the uploaded
 * file descriptors. Throws if the export bridge fails; individual uploads retry
 * a few times before the batch rejects (caller surfaces a retry).
 */
export async function exportAndUploadNotebooks(sessionId) {
  const files = await requestNotebooks();
  const uploaded = [];
  for (const f of files) {
    uploaded.push(await uploadOneWithRetry(sessionId, f));
  }
  return uploaded;
}
