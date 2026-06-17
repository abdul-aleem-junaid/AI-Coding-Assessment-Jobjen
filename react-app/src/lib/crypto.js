// src/lib/crypto.js
//
// Browser-side half of the encrypted-traffic layer. Ported verbatim from the
// admin dashboard / AI-interview SPA (jobjen-admin-dashboard/src/lib/crypto.ts).
// If you change the wire format here, it must stay in sync with the backend's
// CryptoInterceptor.
//
//  - Bootstraps the server's RSA-OAEP-256 public key once via
//    `GET /api/crypto/public-key`, re-bootstrapping when the key rotates.
//  - For every encrypted request: fresh AES-256-GCM key, wrapped with the
//    server public key (X-Crypto-Key header), body AES-encrypted as { iv,
//    ciphertext } (base64).
//  - For every encrypted response (X-Crypto-Encrypted: 1) we decrypt with the
//    SAME AES key used outbound on that request.

import { BASIC_AUTH_HEADER } from "./basicAuth";

const RSA_OAEP_PARAMS = { name: "RSA-OAEP", hash: "SHA-256" };

let bootstrapPromise = null;
let cached = null;

const toB64 = (bytes) => {
  const view =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    bin += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return btoa(bin);
};

const fromB64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function importPublicKey(jwk) {
  return crypto.subtle.importKey("jwk", jwk, RSA_OAEP_PARAMS, false, ["encrypt"]);
}

async function fetchPublicKey() {
  // Native fetch — we can't use the axios instance because that's where this
  // very layer is plugged in. The endpoint is @SkipCrypto() on the server.
  // cache: "no-store" is critical: after a CRYPTO_KID_MISMATCH we re-bootstrap
  // to pick up the server's NEW kid; a cached response would loop on the old
  // kid. We also send the perimeter Basic Auth header (the bootstrap route is
  // behind the same middleware as the rest of the API).
  const headers = {};
  if (BASIC_AUTH_HEADER) headers["Authorization"] = BASIC_AUTH_HEADER;

  const apiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001"
  ).replace(/\/+$/, "");

  const res = await fetch(`${apiBaseUrl}/api/crypto/public-key`, {
    cache: "no-store",
    headers,
  });
  if (!res.ok) {
    throw new Error(`Failed to bootstrap crypto key (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (!json?.kid || !json?.jwk) {
    throw new Error("Crypto bootstrap returned an invalid payload.");
  }
  const key = await importPublicKey(json.jwk);
  return { kid: json.kid, jwk: json.jwk, key };
}

/** Idempotent. Concurrent callers share a single in-flight bootstrap. */
export async function ensureCryptoReady() {
  if (cached) return cached;
  if (!bootstrapPromise) {
    bootstrapPromise = fetchPublicKey()
      .then((b) => {
        cached = b;
        return b;
      })
      .finally(() => {
        bootstrapPromise = null;
      });
  }
  return bootstrapPromise;
}

/** Drop the cached public key so the next request re-bootstraps. */
export function invalidateCryptoBootstrap() {
  cached = null;
  bootstrapPromise = null;
}

export async function makeRequestCrypto() {
  const bundle = await ensureCryptoReady();

  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const rawKey = await crypto.subtle.exportKey("raw", aesKey);
  const wrapped = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    bundle.key,
    rawKey,
  );

  return { aesKey, wrappedKeyB64: toB64(wrapped), kid: bundle.kid };
}

export async function encryptBody(payload, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload ?? null));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptBody(env, aesKey) {
  const iv = fromB64(env.iv);
  const ct = fromB64(env.ciphertext);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
  const text = new TextDecoder().decode(plain);
  return text.length > 0 ? JSON.parse(text) : undefined;
}
