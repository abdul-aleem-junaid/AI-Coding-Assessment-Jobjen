// src/lib/session.js
//
// Tiny module-level store for the technical-round session, plus a React hook to
// read it. The axios layer (api.js) reads the token from here to set the
// `X-Technical-Token` header on every /technical/* call, and components read
// sessionId / candidateName / question.
//
// Kept as a module singleton (not just React state) so the non-React axios
// interceptor can reach the token synchronously.

import { useSyncExternalStore } from "react";

let state = {
  token: "", // the JWT from the magic-link URL (?token=...)
  round: "", // the ?round= value (expected "technical")
  sessionId: "", // set after /apply/technical/start
  candidateName: "",
  question: null, // { questionId, name, description, files, timeLimit, ... }
  deadlineAt: null, // ISO instant the time budget expires (null = no limit)
};

const listeners = new Set();

function emit() {
  for (const l of listeners) l();
}

export function getSession() {
  return state;
}

export function setSession(patch) {
  state = { ...state, ...patch };
  emit();
}

/** Synchronous token accessor for the axios interceptor. */
export function getToken() {
  return state.token;
}

/** Parse `?token=` / `?round=` from the URL (works with HashRouter — the query
 *  string precedes the `#`). Call once at app start. */
export function initSessionFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") ?? "";
    const round = params.get("round") ?? "";
    if (token) setSession({ token, round });
    return { token, round };
  } catch {
    return { token: "", round: "" };
  }
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook — re-renders subscribers when the session changes. */
export function useSession() {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
