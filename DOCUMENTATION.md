# Project Documentation

A React (Vite) application that wraps JupyterLite inside an iframe with security protections: DevTools detection, keyboard shortcut blocking, focus-out blur overlay, and disabled download/open-in-new-tab menu items.

---

## Project Structure

```
AI-Coding-Assessment-Jobjen/
├── .github/
│   └── workflows/
│       └── deploy.yml          ← CI/CD pipeline
├── react-app/
│   ├── public/
│   │   ├── coi-serviceworker.js   ← Cross-origin isolation service worker
│   │   └── lab/                   ← Built JupyterLite output (gitignored)
│   │       └── lab/
│   │           └── index.html     ← Patched JupyterLite Lab UI
│   ├── src/
│   │   ├── App.jsx             ← Main React component (all app logic)
│   │   ├── App.css             ← Styles for all UI elements
│   │   ├── main.jsx            ← React entry point
│   │   └── index.css           ← Base HTML/body reset styles
│   ├── index.html              ← HTML shell (service worker + key blocking)
│   ├── package.json            ← npm dependencies and scripts
│   ├── package-lock.json       ← Locked dependency versions
│   └── vite.config.js          ← Vite build config with COOP/COEP headers
├── scripts/
│   └── patch-build.cjs         ← Post-build patcher for JupyterLite HTML
├── .gitignore                  ← Ignores build artifacts and node_modules
├── .nojekyll                   ← Disables Jekyll on GitHub Pages
├── LICENSE                     ← Project license
├── README.md                   ← Project readme
└── requirements.txt            ← Python packages for JupyterLite build
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
- `base: './'` — makes all asset paths relative, required for GitHub Pages deployment (the app is served from a subdirectory)
- `server.headers` — adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` to every dev-server response. These headers are required for `SharedArrayBuffer`, which Pyodide (the Python kernel) uses. In production, these headers are injected by `coi-serviceworker.js` instead.

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

JupyterLite's Pyodide Python kernel requires `SharedArrayBuffer`, which browsers only allow on pages with cross-origin isolation (`COOP: same-origin` + `COEP: require-corp` headers). GitHub Pages cannot set custom HTTP headers.

This service worker intercepts every fetch request and adds the three required headers to responses:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: cross-origin`

On first install it calls `skipWaiting()` and `clients.claim()` so it activates immediately without requiring a second page load.

---

### `react-app/public/lab/` (gitignored — generated at build time)
**JupyterLite static build output.**

This directory does not exist in the repository. It is generated during CI by:
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

### `.github/workflows/deploy.yml`
**CI/CD pipeline for GitHub Actions.**

Runs on every push to `main` and on pull requests. Steps in order:

| Step | What it does |
|---|---|
| Checkout | Checks out the repository |
| Setup Python 3.11 | Installs Python for the JupyterLite build |
| Install Python dependencies | `pip install -r requirements.txt` |
| Build JupyterLite | `jupyter lite build --output-dir react-app/public/lab` |
| Patch JupyterLite | `node scripts/patch-build.cjs` — injects security scripts |
| Setup Node.js 20 | Installs Node for the React build |
| Install React dependencies | `npm ci` inside `react-app/` |
| Build React app | `npm run build` — outputs to `react-app/dist/` |
| Upload artifact | Uploads `react-app/dist/` as a GitHub Pages artifact |
| Deploy | Deploys the artifact to GitHub Pages (only on `main` pushes) |

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

### `.nojekyll`
**Empty file required for GitHub Pages.**

By default, GitHub Pages runs Jekyll on the repository and ignores files and folders that start with an underscore (`_`). JupyterLite generates several such directories (e.g., `_static/`). The `.nojekyll` file tells GitHub Pages to serve the files as-is without any Jekyll processing.

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

```bash
# 1. Build JupyterLite (one-time or after changing requirements.txt)
pip install -r requirements.txt
jupyter lite build --output-dir react-app/public/lab
node scripts/patch-build.cjs

# 2. Run the React dev server
cd react-app
npm install
npm run dev
# → http://localhost:5173
```

> **Windows note:** `jupyter lite build` may fail due to the 260-character MAX_PATH limit.
> Workaround: build to a short path then copy:
> ```bash
> jupyter lite build --output-dir C:\jlbuild
> node -e "require('fs').cpSync('C:/jlbuild', 'react-app/public/lab', {recursive:true, force:true})"
> node scripts/patch-build.cjs
> ```
