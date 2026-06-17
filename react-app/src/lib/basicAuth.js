// src/lib/basicAuth.js
//
// Build-time HTTP Basic Auth credential shared by every backend request this
// SPA sends. The backend wraps a `BasicAuthMiddleware` around the entire NestJS
// surface in production — if these credentials are absent the app sees a wall of
// 401s as soon as it tries to bootstrap the crypto layer. In dev the middleware
// is a no-op, so leaving these unset is fine locally.
//
// Wire format — THREE PARTS:
//   Authorization: Basic <base64(USERNAME:PASSWORD:CLIENT_MARKER)>
// The CLIENT_MARKER is an opaque value smuggled into the password slot so
// credential-stuffing scanners that only guess user:pass still get 401'd.
//
// Config (read from Vite's import.meta.env — baked into the bundle at build):
//   VITE_API_BASIC_AUTH         Pre-encoded base64(user:pass:marker). Preferred.
//   VITE_API_BASIC_AUTH_USER    Plaintext fallback, combined + encoded at load.
//   VITE_API_BASIC_AUTH_PASS
//   VITE_API_BASIC_AUTH_MARKER
//
// Security note: anything baked into a browser bundle is readable by anyone who
// visits the site. This is a PERIMETER (stops random probes), not a secret. The
// real authn is the single-use technical JWT.

const encoded = (() => {
  const direct = import.meta.env.VITE_API_BASIC_AUTH?.trim();
  if (direct) return direct;

  const user = import.meta.env.VITE_API_BASIC_AUTH_USER?.trim();
  const pass = import.meta.env.VITE_API_BASIC_AUTH_PASS?.trim();
  const marker = import.meta.env.VITE_API_BASIC_AUTH_MARKER?.trim();
  if (user && pass) {
    try {
      const combined = marker ? `${user}:${pass}:${marker}` : `${user}:${pass}`;
      return btoa(combined);
    } catch {
      // btoa throws on non-Latin1 input. Fall through to "disabled".
      return "";
    }
  }
  return "";
})();

/** Full `Authorization` header value, or `null` when basic auth is off. */
export const BASIC_AUTH_HEADER = encoded ? `Basic ${encoded}` : null;

/** True when this build is configured to send Basic Auth on every request. */
export const BASIC_AUTH_ENABLED = BASIC_AUTH_HEADER !== null;
