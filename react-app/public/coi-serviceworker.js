/**
 * coi-serviceworker.js
 *
 * Intercepts every response and injects the two headers that enable
 * cross-origin isolation (required by SharedArrayBuffer / Pyodide / WASM
 * threads) on static hosts like GitHub Pages that cannot set HTTP headers.
 *
 * Based on gzuidhof/coi-serviceworker (MIT) with robustness improvements.
 */

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim())
);

/* ── Fetch interception ───────────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Skip non-GET requests that browsers don't cache/intercept this way.
  if (req.method !== 'GET') return;

  // Skip "only-if-cached" requests with a non-same-origin mode — Chrome
  // throws a TypeError for these if we call fetch() on them.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        // Opaque responses (status 0) cannot be modified — pass through.
        if (!response || response.status === 0 || response.type === 'opaque') {
          return response;
        }

        const headers = new Headers(response.headers);

        // These two headers enable crossOriginIsolated on any document
        // that receives them, allowing SharedArrayBuffer usage.
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

        // Allow same-origin AND cross-origin pages to embed resources from
        // this origin without triggering COEP blocking.
        headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

        return new Response(response.body, {
          status:     response.status,
          statusText: response.statusText,
          headers,
        });
      })
      .catch(() => {
        // Network failure — fall back to the native request so the browser
        // shows its own error rather than a silent blank.
        return fetch(req);
      })
  );
});
