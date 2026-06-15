# AI Coding Assessment | Jobjen

An interactive, browser-based coding assessment platform built for Jobjen. Candidates write and run real Python/JavaScript code directly in the browser — no installs, no setup.

## Try it

**https://abdul-aleem-junaid.github.io/AI-Coding-Assessment-Jobjen/**

## Features

- **In-browser execution** — powered by [JupyterLite](https://jupyterlite.readthedocs.io/), runs entirely client-side via WebAssembly
- **DevTools protection** — detects and blocks developer tools to maintain assessment integrity
- **Tab-switch detection** — blurs the environment when the candidate leaves the tab
- **No download** — file download is disabled inside the notebook

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Notebook engine | JupyterLite (Pyodide + JS kernels) |
| Deployment | GitHub Pages via GitHub Actions |

## Local Development

```bash
# Install Python dependencies & build JupyterLite
pip install -r requirements.txt
jupyter lite build --output-dir react-app/public/lab

# Patch the build (disables download)
node scripts/patch-build.cjs

# Start the React dev server
cd react-app
npm install
npm run dev
```

## Deployment

Push to `main` — GitHub Actions builds JupyterLite, builds the React app, and deploys to GitHub Pages automatically.

## Browser Requirements

- Chrome / Edge 89+
- Firefox 90+
