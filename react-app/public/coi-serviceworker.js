/* Cross-Origin Isolation service worker — required for Pyodide (SharedArrayBuffer) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function handleFetch(request) {
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
  try {
    const response = await fetch(request);
    if (response.status === 0) return response;
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return fetch(request);
  }
}

self.addEventListener('fetch', (event) => {
  event.respondWith(handleFetch(event.request));
});
