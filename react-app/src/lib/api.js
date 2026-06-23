// src/lib/api.js
//
// Axios instance for the technical-round backend, with the RSA+AES-GCM
// encrypted-traffic layer. Adapted from the admin dashboard's api.ts: the
// candidate app has NO admin cookie session, so the 401-refresh interceptor and
// /admin/auth handling are removed. Instead we inject the single-use
// `X-Technical-Token` (from the URL) on every /technical/* call.

import axios from "axios";
import {
  decryptBody,
  encryptBody,
  invalidateCryptoBootstrap,
  makeRequestCrypto,
} from "./crypto";
import { BASIC_AUTH_HEADER } from "./basicAuth";
import { getToken } from "./session";

const defaultHeaders = { "X-Requested-With": "XMLHttpRequest" };
if (BASIC_AUTH_HEADER) defaultHeaders.Authorization = BASIC_AUTH_HEADER;

/**
 * Absolute origin of jobjen-backend (no trailing slash, no /api). This is the
 * ONLY source of the backend location: it comes solely from VITE_API_BASE_URL
 * (set in .env locally / the Vercel dashboard in prod). No hardcoded fallback
 * and no relative/proxy mode — every request goes to this URL and nowhere else.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(
  /\/+$/,
  "",
);
if (!API_BASE_URL) {
  console.error(
    "[api] VITE_API_BASE_URL is not set — backend requests cannot be sent. " +
      "Set it to the backend origin, e.g. https://api.jobjen.com",
  );
}

/** Resolve a backend path to an absolute URL (for the few calls that don't go
 *  through the axios instance, e.g. the crypto bootstrap). */
export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  // No cookies: auth is the single-use technical JWT, not a session cookie.
  withCredentials: false,
  headers: defaultHeaders,
});

const SKIP_HEADER = "x-skip-crypto";

function shouldSkipEntirely(config) {
  const skipHeader = config.headers?.[SKIP_HEADER];
  if (skipHeader === "1" || skipHeader === 1 || skipHeader === true) return true;
  const url = config.url ?? "";
  if (url.includes("/crypto/public-key")) return true;
  return false;
}

function isBinaryBody(data) {
  if (typeof FormData !== "undefined" && data instanceof FormData) return true;
  if (typeof Blob !== "undefined" && data instanceof Blob) return true;
  if (data instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(data)) return true;
  return false;
}

// ── Request: attach the technical token + encrypt the body ──────────────────
api.interceptors.request.use(async (config) => {
  // The single-use invite JWT authorises every /technical/* call. /apply/* (the
  // bootstrap) carries the token in its body instead, so the header is harmless
  // there — we send it on every call for simplicity.
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers["X-Technical-Token"] = token;
  }

  if (shouldSkipEntirely(config)) {
    if (config.headers) delete config.headers[SKIP_HEADER];
    return config;
  }

  const reqCrypto = await makeRequestCrypto();
  config.__crypto = reqCrypto;

  config.headers = config.headers ?? {};
  config.headers["X-Crypto-Key"] = reqCrypto.wrappedKeyB64;
  config.headers["X-Crypto-Kid"] = reqCrypto.kid;

  const isGetLike = config.method?.toLowerCase() === "get";
  const hasBody = config.data !== undefined && config.data !== null && !isGetLike;
  if (hasBody && !isBinaryBody(config.data)) {
    if (config.__originalData === undefined) config.__originalData = config.data;
    config.data = await encryptBody(config.__originalData, reqCrypto.aesKey);
    config.headers["Content-Type"] = "application/json";
  }

  config.responseType = "json";
  return config;
});

// ── Response: decrypt + recover from key rotation ───────────────────────────
api.interceptors.response.use(
  async (response) => {
    if (response.headers["x-crypto-encrypted"] !== "1") return response;
    const reqCrypto = response.config.__crypto;
    if (!reqCrypto) {
      throw new Error(
        "Server returned an encrypted response but no AES key was available.",
      );
    }
    const env = response.data;
    if (env && typeof env.iv === "string" && typeof env.ciphertext === "string") {
      response.data = await decryptBody(env, reqCrypto.aesKey);
    }
    return response;
  },
  async (error) => {
    const response = error.response;
    const config = error.config;

    // Decrypt error bodies first so downstream handlers see the real payload.
    if (
      response?.headers?.["x-crypto-encrypted"] === "1" &&
      config?.__crypto &&
      response.data &&
      typeof response.data.iv === "string"
    ) {
      try {
        response.data = await decryptBody(response.data, config.__crypto.aesKey);
      } catch {
        // Leave as-is.
      }
    }

    // Key rotation: drop the cached public key and retry once with a fresh
    // handshake so a backend restart recovers transparently.
    if (response?.status === 400 && config) {
      const data = response.data;
      const code = typeof data?.code === "string" ? data.code : undefined;
      const message = typeof data?.message === "string" ? data.message : undefined;
      const messageLooksLikeKidMismatch =
        typeof message === "string" &&
        /encryption key id|public key|crypto[_-]?(kid|unwrap)/i.test(message);
      const isCryptoRotation =
        code === "CRYPTO_KID_MISMATCH" ||
        code === "CRYPTO_UNWRAP_FAILED" ||
        code === "CRYPTO_BODY_DECRYPT_FAILED" ||
        messageLooksLikeKidMismatch;

      if (isCryptoRotation) {
        invalidateCryptoBootstrap();
        if (!config._retriedAfterKidMismatch) {
          config._retriedAfterKidMismatch = true;
          delete config.__crypto;
          if (config.__originalData !== undefined) config.data = config.__originalData;
          return api(config);
        }
      }
    }

    return Promise.reject(error);
  },
);

export default api;
