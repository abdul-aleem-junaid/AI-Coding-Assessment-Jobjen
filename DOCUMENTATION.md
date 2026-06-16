# Project Documentation

A React (Vite) application that wraps JupyterLite inside an iframe with security protections: DevTools detection, keyboard shortcut blocking, focus-out blur overlay, and disabled download/open-in-new-tab menu items.

---

## Project Structure

```
AI-Coding-Assessment-Jobjen/
├── react-app/
│   ├── public/
│   │   ├── coi-serviceworker.js   ← Cross-origin isolation service worker (fallback)
│   │   └── lab/                   ← Built JupyterLite output (gitignored)
│   │       └── lab/
│   │           └── index.html     ← Patched JupyterLite Lab UI
│   ├── src/                    ← React app (pages/, components/, lib/, utils/)
│   ├── index.html              ← HTML shell (service worker + key blocking)
│   ├── package.json            ← npm dependencies and scripts
│   ├── package-lock.json       ← Locked dependency versions
│   └── vite.config.js          ← Vite config (COOP/COEP dev headers + /api proxy)
├── scripts/
│   ├── install-all.mjs         ← Installs Python + Node deps (one command)
│   ├── build-all.mjs           ← JupyterLite build → patch → Vite build
│   └── patch-build.cjs         ← Post-build patcher for JupyterLite HTML
├── vercel.json                 ← Deploy contract (build commands, /api rewrite, headers)
├── package.json                ← Root build orchestration scripts
├── requirements.txt            ← Python packages for the JupyterLite build
├── .vercelignore               ← Excludes regenerated dirs from the Vercel upload
├── .gitignore                  ← Ignores build artifacts and node_modules
├── LICENSE                     ← Project license
└── README.md                   ← Project readme
```

---

## File-by-File Reference

### `react-app/src/App.jsx`
**The main React component — all application logic lives here.**

Manages three pieces of state:
- `open` — whether the JupyterLite iframe is shown (starts `false`, landing page shown first)
- `toast` — whether the DevTools warning banner is visible
- `blurred` — whether the blur overlay is covering the screen

**Landing page:** When `open` is `false`, renders a centered page with a title, description, and "Open Editor" button. Clicking the button sets `open = true` and the iframe renders.

**DevTools detection (two-layer):**
1. Parent layer: `DisableDevtool` (npm package) runs in the React app window and calls `handleDevToolsOpen` when it detects DevTools.
2. Iframe layer: A script injected into JupyterLite's HTML calls `window.parent.__onDevToolsOpen`, which is the same handler exposed via `window.__onDevToolsOpen`.

`handleDevToolsOpen` is guarded by a `triggered` ref so it only fires once. It shows the toast, blanks the iframe (`iframe.src = 'about:blank'` — prevents the "Leave site?" browser dialog), then redirects to google.com after 1.5 seconds.

**Focus-out blur (two-layer):**
1. Parent layer: `window` blur/focus events and `document.visibilitychange` detect when the user leaves the tab or window. Uses `document.hasFocus()` to avoid false positives when the user simply clicks into the iframe (which fires `window.blur` on the parent).
2. Iframe layer: `handleIframeLoad` is called when the iframe loads. It attaches blur/focus listeners to `iframeRef.current.contentWindow` — this is necessary because when the user's focus is inside the iframe, only the iframe's window fires blur events when the user leaves, not the parent window.

When `blurred` is `true`, a full-screen overlay with a backdrop blur covers everything.

---

### `react-app/src/App.css`
**Styles for all visual elements.**

| Selector | Purpose |
|---|---|
| `*` | Global box-sizing reset |
| `.app` | Full-viewport container for the iframe view (100vw × 100vh) |
| `.jupyter-frame` | The `<iframe>` element — fills `.app` entirely, no border |
| `.landing` | Centered flex column for the pre-open landing page |
| `.landing button` | Orange "Open Editor" button with hover state |
| `.toast` | Fixed red notification banner (top-right, z-index 99999, slides in from the right) |
| `.blur-overlay` | Fixed full-screen overlay (z-index 9998) with `backdrop-filter: blur(18px)` and a semi-transparent dark tint |

---

### `react-app/src/main.jsx`
**React entry point.**

Mounts the `<App />` component into `<div id="root">` using React 18's `createRoot`. Imports `index.css` for the base reset. No logic of its own.

---

### `react-app/src/index.css`
**Base reset for the HTML shell.**

Sets `html`, `body`, and `#root` to full width/height with no margin, padding, or overflow. This ensures the iframe can fill the entire viewport without scrollbars.

---

### `react-app/index.html`
**The HTML shell that Vite uses as the entry point.**

Contains two inline scripts that run before React loads:

1. **Service worker registration** — registers `./coi-serviceworker.js`. If a new service worker is installing or waiting, it listens for the `activated` state and reloads the page so the COOP/COEP headers take effect immediately.

2. **Keyboard shortcut blocking (parent window)** — listens on `keydown` in the capture phase (fires before any other handler). Calls `e.preventDefault()` and `e.stopPropagation()` for:
   - `F12`
   - `Ctrl+Shift+I`, `Ctrl+Shift+J`, `Ctrl+Shift+C`, `Ctrl+Shift+K`
   - `Ctrl+U`

---

### `react-app/vite.config.js`
**Vite build configuration.**

- `plugins: [react()]` — enables JSX transform via `@vitejs/plugin-react`
- `base: './'` — makes all asset paths relative so the bundle works from any path
- `server.headers` — adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` to every dev-server response. These headers are required for `SharedArrayBuffer`, which Pyodide (the Python kernel) uses. In production they're set by `vercel.json`, with `coi-serviceworker.js` as a fallback.
- `server.proxy` — forwards `/api` to the backend (default `http://localhost:3001`, override with `VITE_DEV_PROXY_TARGET`) so dev calls are same-origin (no CORS).

---

### `react-app/package.json`
**npm manifest and scripts.**

| Script | Command | Use |
|---|---|---|
| `dev` | `vite` | Local development server on port 5173 |
| `build` | `vite build` | Production bundle into `react-app/dist/` |
| `preview` | `vite preview` | Preview the production build locally |

**Runtime dependencies:**
- `react` + `react-dom` — React 18
- `disable-devtool` — DevTools detection library for the parent window

**Dev dependencies:**
- `vite` — build tool
- `@vitejs/plugin-react` — JSX support for Vite

---

### `react-app/public/coi-serviceworker.js`
**Cross-origin isolation service worker.**

JupyterLite's Pyodide Python kernel requires `SharedArrayBuffer`, which browsers only allow on pages with cross-origin isolation (`COOP: same-origin` + `COEP: require-corp` headers). On Vercel these are set at the edge by `vercel.json`; this service worker is a **fallback** for hosts that can't set custom HTTP headers (and a no-op once the page is already isolated).

This service worker intercepts every fetch request and adds the three required headers to responses:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: cross-origin`

On first install it calls `skipWaiting()` and `clients.claim()` so it activates immediately without requiring a second page load.

---

### `react-app/public/lab/` (gitignored — generated at build time)
**JupyterLite static build output.**

This directory does not exist in the repository. It is generated at build time by:
```
jupyter lite build --output-dir react-app/public/lab
```
Then patched by `scripts/patch-build.cjs`. The React app's iframe points to `./lab/lab/index.html`, which is the full JupyterLab UI.

---

### `react-app/public/lab/lab/index.html` (generated + patched)
**The JupyterLite Lab UI — patched with three security scripts.**

The base file is generated by `jupyter lite build`. `scripts/patch-build.cjs` injects three `<script>` blocks before `</body>`:

1. **DevTools detection (iframe layer):** Runs a 500ms interval. Checks two signals:
   - Window size gap: if `outerWidth - innerWidth > 160` or `outerHeight - innerHeight > 160`, docked DevTools are open.
   - Console getter trick: logs a plain object with an enumerable getter (`{ get _() {} }`); if the getter is triggered, DevTools is reading the object, meaning it's open.
   When detected, calls `window.parent.__onDevToolsOpen()` to notify the parent React app.

2. **Keyboard shortcut blocking (iframe layer):** Same F12 / Ctrl+Shift+I/J/C/K / Ctrl+U blocking as in `index.html`, but applied inside the iframe's document so shortcuts are blocked even when the user is interacting with JupyterLite.

3. **Download/open-tab menu hider:** A `MutationObserver` watches the entire document body for DOM changes. Whenever JupyterLite renders a context menu or file menu, it scans all `.lm-Menu-item` elements and sets `display: none` on any item whose label text matches `'download'`, `'open in new browser tab'`, or `'open in new tab'`.

---

### `scripts/patch-build.cjs`
**Post-build script that injects security code into JupyterLite's HTML.**

Run after `jupyter lite build` completes (both in CI and locally). Reads `react-app/public/lab/lab/index.html`, checks if the patch was already applied (idempotency guard: looks for `hideDownloadItems` in the file), and if not, inserts the three security script blocks before `</body>`.

This architecture means JupyterLite can be rebuilt at any time and the security patches are re-applied by running this script once — no manual editing of generated files required.

**Local usage:**
```
node scripts/patch-build.cjs
```

---

### `vercel.json` + `package.json` + `scripts/*.mjs`
**The deploy contract (Vercel) and the one-command build orchestration.**

`vercel.json` tells Vercel to install and build everything itself:
- `installCommand` → `node scripts/install-all.mjs` (pip install `requirements.txt` + `npm ci` in `react-app/`)
- `buildCommand` → `node scripts/build-all.mjs` (`jupyter lite build` → `patch-build.cjs` → `vite build`)
- `outputDirectory` → `react-app/dist`
- `rewrites` → proxies `/api/*` to the backend so the SPA is same-origin (no CORS)
- `headers` → COOP/COEP (cross-origin isolation for Pyodide) + caching + security headers

The root `package.json` exposes the same orchestrators locally: `npm run install:all`,
`npm run build`, `npm run dev`. The `scripts/*.mjs` are cross-platform (probe
`python3`/`python`, run from the repo root with relative args).

---

### `requirements.txt`
**Python packages installed before running `jupyter lite build`.**

| Package | Purpose |
|---|---|
| `jupyterlite-core` | Core JupyterLite build tooling |
| `jupyterlab` | JupyterLab UI components bundled into the static build |
| `notebook` | Notebook interface support |
| `jupyterlite-pyodide-kernel` | Python kernel (runs Python via WebAssembly in the browser) |
| `jupyterlite-javascript-kernel` | JavaScript kernel |
| `jupyterlite-p5-kernel` | p5.js creative coding kernel |
| `jupyterlab-language-pack-fr-FR` / `-zh-CN` | French and Chinese UI translations |
| `jupyterlab-fasta` | Renderer for FASTA bioinformatics files |
| `jupyterlab-geojson` | Renderer for GeoJSON map data |
| `jupyterlab-night` / `jupyterlab_miami_nights` | Dark/themed UI skins |
| `ipywidgets` | Interactive notebook widgets (sliders, buttons, etc.) |
| `ipyevents` | Mouse and keyboard event widgets |
| `ipympl` | Interactive Matplotlib figures |
| `ipycanvas` | Canvas drawing widget |
| `ipyleaflet` | Interactive map widget |
| `plotly` | Interactive charting library |
| `bqplot` | Grammar-of-graphics plotting for notebooks |

---

### `.gitignore`
**Tells Git which files to exclude from version control.**

Key entries relevant to this project:

| Pattern | What it ignores |
|---|---|
| `node_modules/` | npm packages (installed via `npm ci`) |
| `*.doit.db` | JupyterLite's doit task-runner database (build artifact) |
| `_output` | Default JupyterLite build output directory |
| `react-app/public/lab/` | JupyterLite build output inside the React app |
| `react-app/dist/` | Vite production build output |

---

## How Everything Connects

```
Browser
  └── Loads React app (index.html)
        ├── Registers coi-serviceworker.js (adds COOP/COEP headers)
        ├── Blocks DevTools keyboard shortcuts (capture-phase keydown)
        └── Mounts App.jsx
              ├── Landing page → user clicks "Open Editor"
              ├── Renders <iframe src="./lab/lab/index.html">
              │     └── JupyterLite Lab UI
              │           ├── Keyboard shortcut blocking (iframe layer)
              │           ├── DevTools detection → calls window.parent.__onDevToolsOpen
              │           └── MutationObserver hides Download/Open-in-new-tab items
              ├── DisableDevtool (parent window DevTools detection)
              ├── window blur/focus + visibilitychange → blur overlay
              └── iframeRef.contentWindow blur/focus → blur overlay (when focus is inside iframe)
```

## Local Development

Two commands from the repo root — the first installs every dependency (Python +
Node), the second builds JupyterLite, patches it, and bundles the React app:

```bash
npm run install:all   # pip install -r requirements.txt  +  npm ci in react-app/
npm run build         # jupyter lite build → patch-build → vite build
npm run dev           # Vite dev server → http://localhost:5173 (proxies /api)
```

Requires **Node.js 20+** and **Python 3** on PATH.

> **Windows note:** JupyterLite writes deeply nested extension paths that exceed
> the legacy 260-char `MAX_PATH`. Enable long paths once, as admin, then restart
> the terminal:
> ```powershell
> reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f
> ```
> Linux/macOS and Vercel's build are unaffected.

## Deployment (Vercel)

`vercel.json` makes the platform install + build everything automatically — no
manual steps. Import the repo into Vercel with **Root Directory** = repo root,
**Framework** = *Other*, **Node** = *20.x*; set the env vars from
[react-app/.env.example](react-app/.env.example) (leave `VITE_API_BASE_URL`
empty so `/api` is rewritten to the backend); point the `/api` rewrite in
`vercel.json` at your backend origin; deploy. See [README.md](README.md) for the
full checklist and the S3-CORS prerequisite.
