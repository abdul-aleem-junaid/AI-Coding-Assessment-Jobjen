// src/app/App.jsx
//
// Root application shell: router, DevTools guard wiring, the global "DevTools
// detected" toast, and the technical-round session bootstrap (token → session).
// Route-level code lives in src/pages/.

import { useState, useEffect, useRef } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

import {
  registerDevToolsToast,
  setDevToolsGuardActive,
  isDevToolsTriggered,
  DEVTOOLS_GUARD_ENABLED,
} from "../utils/devtoolsGuard";
import { getSession, setSession } from "../lib/session";
import api from "../lib/api";
import LandingPage from "../pages/LandingPage";
import PreflightPage from "../pages/PreflightPage";
import AssessmentPage from "../pages/AssessmentPage";

import "./App.css";

// Map the backend's LINK_* error codes to candidate-friendly copy.
function describeStartError(err) {
  const data = err?.response?.data;
  const code = data?.code;
  const map = {
    LINK_EXPIRED:
      "This assessment link has expired. Please contact the recruiter for a new one.",
    LINK_USED:
      "This assessment has already been submitted. Each link can be used once.",
    LINK_REPLACED:
      "This link was replaced by a newer invitation — please open the most recent email.",
    LINK_INVALID:
      "This assessment link is invalid. Please use the link from your invitation email.",
  };
  if (code && map[code]) return map[code];
  if (data?.message) return data.message;
  return "We could not start your assessment. Please check your link and try again.";
}

function ErrorScreen({ message }) {
  return (
    <div className="jobjen-hero w-screen h-screen flex flex-col items-center justify-center gap-4 font-sans px-6">
      <span className="jobjen-badge text-[0.7rem] font-bold tracking-[0.12em] px-3 py-1 rounded-sm">
        Jobjen
      </span>
      <h1 className="text-[1.75rem] font-bold text-jobjen-text text-center">
        Cannot start assessment
      </h1>
      <p className="text-base text-jobjen-muted max-w-[440px] text-center leading-relaxed">
        {message}
      </p>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAssessment = location.pathname === "/assessment";

  const [toast, setToast] = useState(() => isDevToolsTriggered());
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(() =>
    getSession().token
      ? ""
      : "No assessment link detected. Please open the link from your invitation email.",
  );
  const streamRef = useRef(null); // webcam + mic (live PiP)
  const screenStreamRef = useRef(null); // screen capture (recorded)

  // Stop media tracks on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Register the toast callback so devtoolsGuard can trigger it
  useEffect(() => {
    registerDevToolsToast(() => setToast(true));
    return () => registerDevToolsToast(null);
  }, []);

  // Activate / suspend the guard depending on the current route
  useEffect(() => {
    if (!DEVTOOLS_GUARD_ENABLED) return;
    setDevToolsGuardActive(isAssessment);
  }, [isAssessment]);

  // Block DevTools keyboard shortcuts on the assessment page
  useEffect(() => {
    if (!DEVTOOLS_GUARD_ENABLED || !isAssessment) return;
    const onKeyDown = (e) => {
      const isDevShortcut =
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          ["I", "J", "C", "K"].includes(e.key.toUpperCase()));
      if (isDevShortcut) e.preventDefault();
    };
    const onContextMenu = (e) => e.preventDefault();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [isAssessment]);

  // "Start Assessment" → verify the token + create/resume the session, then go
  // to the preflight checks.
  const handleStart = async () => {
    const { token } = getSession();
    if (!token) {
      setStartError(
        "No assessment link detected. Please open the link from your invitation email.",
      );
      return;
    }
    setStarting(true);
    try {
      const res = await api.post("/apply/technical/start", { token });
      const { sessionId, candidateName, question } = res.data ?? {};
      setSession({ sessionId, candidateName, question });
      setStartError("");
      navigate("/preflight");
    } catch (err) {
      setStartError(describeStartError(err));
    } finally {
      setStarting(false);
    }
  };

  if (startError && location.pathname === "/") {
    return <ErrorScreen message={startError} />;
  }

  return (
    <>
      {toast && (
        <div className="fixed top-5 right-5 z-[99999] bg-red-800 text-white text-sm font-semibold px-[22px] py-[14px] rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.35)] animate-slide-in font-sans">
          Access Restricted: Developer tools are not allowed.
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={<LandingPage onStart={handleStart} starting={starting} />}
        />
        <Route
          path="/preflight"
          element={
            <PreflightPage
              streamRef={streamRef}
              screenStreamRef={screenStreamRef}
              onBegin={() => navigate("/assessment")}
            />
          }
        />
        <Route
          path="/assessment"
          element={
            streamRef.current && screenStreamRef.current ? (
              <AssessmentPage
                streamRef={streamRef}
                screenStreamRef={screenStreamRef}
              />
            ) : (
              <Navigate to="/preflight" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
