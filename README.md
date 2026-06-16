# AI Coding Assessment | Jobjen

An interactive, browser-based coding assessment for Jobjen's technical round.
Candidates open a single-use invite link, their screen is recorded, they solve
the task in a real in-browser Python notebook (JupyterLite + Pyodide), and on
submit their screen recording and solution notebooks are uploaded to the
backend.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Notebook engine | JupyterLite (Pyodide kernel, runs client-side via WebAssembly) |
| Transport | RSA + AES-GCM encrypted envelope to the Jobjen backend |
| Deployment | Vercel |

## Build prerequisites

The build needs **both** toolchains (the orchestrator scripts install the
dependencies, but the runtimes themselves must be present):

- **Node.js 20+**
- **Python 3** (3.11 recommended) — used to build JupyterLite

> **Windows only:** JupyterLite writes deeply nested extension paths that exceed
> the legacy 260-char `MAX_PATH`. Enable long paths once, as admin, then restart
> the terminal:
> ```powershell
> reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f
> ```
> Linux/macOS and Vercel's build are unaffected.

## Local development

One command installs every dependency (Python + Node); a second builds
everything (JupyterLite → patch → Vite):

```bash
npm run install:all   # pip install -r requirements.txt  +  npm ci in react-app/
npm run build         # jupyter lite build → patch-build → vite build
npm run dev           # Vite dev server (proxies /api → backend, see vite.config.js)
```

By default the dev server proxies `/api` to `http://localhost:3001`. Point it
elsewhere with `VITE_DEV_PROXY_TARGET`. See [react-app/.env.example](react-app/.env.example)
for the build-time env vars.

## Deployment (Vercel)

Everything the platform needs is in [vercel.json](vercel.json) — Vercel installs
Python + Node deps, builds JupyterLite, patches it, and runs the Vite build, all
from the install/build commands. No manual steps.

1. **Import the repo** into Vercel. Set **Root Directory** to the repo root (this
   folder, so `requirements.txt`, `scripts/`, and `react-app/` are all in scope),
   **Framework Preset** = *Other*, **Node.js** = *20.x*.
2. **Environment variables** (Production + Preview):
   - `VITE_API_BASE_URL` — leave **empty** (the SPA calls a relative `/api`,
     which `vercel.json` rewrites to the backend).
   - `VITE_ENABLE_DEVTOOLS_GUARD` = `true`
   - `VITE_API_BASIC_AUTH` (or `VITE_API_BASIC_AUTH_USER` / `_PASS` / `_MARKER`)
     if the backend's perimeter Basic Auth is enabled.
3. **Backend origin:** the rewrite in [vercel.json](vercel.json) points `/api/*`
   at `https://api.jobjen.com`. Change that line if you deploy against a
   different backend (e.g. a Railway dev URL).
4. **Deploy.** Pushes to the connected branch build and deploy automatically;
   every branch/PR gets a preview URL.

### Backend / infra prerequisites
- **S3 bucket CORS** must allow the SPA's origin: `PUT` + `GET`, and **expose the
  `ETag` header** (the resumable screen-recording upload reads it). Without this
  the multipart upload fails.
- The crypto envelope, single-use JWT, and Basic Auth perimeter are all handled
  by the backend; the SPA just needs to reach it (same-origin via the rewrite).

## How it works (flow)

1. Recruiter sends `…/?token=<JWT>&round=technical`.
2. The app verifies the token (`POST /api/apply/technical/start`) and loads the
   question + attachment files.
3. Preflight: candidate grants camera/mic and screen share.
4. Assessment: screen+mic recording streams to S3 (resumable multipart); the
   question's files are imported into the notebook and auto-opened.
5. Submit: the recording is finalized, every workspace `.ipynb` is uploaded, and
   the session is marked submitted. The link is single-use.

## Browser requirements

- Chrome / Edge 89+ or Firefox 90+ (needs `SharedArrayBuffer` / cross-origin
  isolation for the Pyodide kernel — provided by the COOP/COEP headers in
  `vercel.json`, with `public/coi-serviceworker.js` as a fallback).
