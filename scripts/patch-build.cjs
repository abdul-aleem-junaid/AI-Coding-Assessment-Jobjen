/**
 * scripts/patch-build.cjs
 *
 * Runs AFTER `jupyter lite build` to patch the generated lab/lab/index.html.
 * This is the authoritative source for ALL Jobjen assessment lockdown code —
 * it injects CSS, keyboard-guard, and the MutationObserver lockdown script
 * so the deployed build matches local development exactly.
 *
 * Called by GitHub Actions:
 *   node scripts/patch-build.cjs
 */

const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "../react-app/public/lab/lab/index.html");

if (!fs.existsSync(target)) {
  console.error("[patch-build] ERROR — target not found:", target);
  console.error("Run: jupyter lite build --output-dir react-app/public/lab");
  process.exit(1);
}

/* ── 1. Theme stylesheet link ───────────────────────────────────────────── */
const THEME_LINK =
  '<link rel="stylesheet" href="../../jobjen-jupyter-theme.css" />';

/* ── 2. Inline lockdown CSS (exact selectors confirmed from live DOM) ───── */
const LOCKDOWN_CSS = `
    <style>
      /* ── JOBJEN ASSESSMENT LOCKDOWN — exact selectors from live DOM ── */

      /* Top menu bar */
      #jp-MainMenu { display: none !important; }

      /* Status bar */
      #jp-main-statusbar,
      .jp-StatusBar-widget { display: none !important; }

      /* Launcher welcome page */
      .jp-Launcher { display: none !important; }

      /* Left sidebar: Running Terminals & Kernels tab */
      .jp-SideBar .lm-TabBar-tab[data-id="jp-running-sessions"],
      .jp-SideBar [title="Running Terminals and Kernels"] { display: none !important; }

      /* Left sidebar: Table of Contents tab */
      .jp-SideBar .lm-TabBar-tab[data-id="toc"],
      .jp-SideBar [title="Table of Contents"] { display: none !important; }

      /* "+" New Launcher tab add-button (tab bar) */
      .lm-TabBar-addButton { display: none !important; }

      /* ── File-browser toolbar buttons ── */
      [data-jp-item-name="new-launcher"],
      [data-jp-item-name="new-folder"],
      [data-jp-item-name="newFolder"],
      [data-jp-item-name="upload"],
      [data-jp-item-name="uploadFiles"],
      [data-jp-item-name="new-file"],
      [data-jp-item-name="open-path"] { display: none !important; }

      jp-button[aria-label*="New Folder"],
      jp-button[aria-label*="Upload"],
      jp-button[title*="New Folder"],
      jp-button[title*="Upload Files"] { display: none !important; }

      .jp-Toolbar-item:has(jp-button[aria-label*="New Folder"]),
      .jp-Toolbar-item:has(jp-button[aria-label*="Upload"]),
      .jp-Toolbar-item:has(jp-button[title*="New Folder"]),
      .jp-Toolbar-item:has(jp-button[title*="Upload Files"]) { display: none !important; }

      /* ── Notebook toolbar restricted items ── */
      [data-jp-item-name="interfaceSwitcher"] { display: none !important; }
      [data-jp-item-name="executionProgress"] { display: none !important; }
      [data-jp-item-name="kernelName"],
      [data-jp-item-name="kernel-name"],
      [data-jp-item-name="switch-kernel"],
      [data-jp-item-name="kernelStatus"] { display: none !important; }

      jp-button[aria-label*="Switch Kernel"],
      jp-button[title*="Switch Kernel"],
      jp-button[aria-label*="kernel logs"],
      jp-button[title*="kernel logs"],
      jp-button[title*="Kernel Logs"] { display: none !important; }

      .jp-Toolbar-item:has(jp-button[aria-label*="Switch Kernel"]),
      .jp-Toolbar-item:has(jp-button[title*="Switch Kernel"]),
      .jp-Toolbar-item:has(jp-button[aria-label*="kernel logs"]),
      .jp-Toolbar-item:has(jp-button[title*="kernel logs"]) { display: none !important; }

      .lm-Menu-item.jp-jobjen-blocked { display: none !important; }
    </style>`;

/* ── 3. DevTools detection script (reports to parent React app) ─────────── */
const DEVTOOLS_SCRIPT = `
    <script>
      (function () {
        var fired = false;
        var hits = 0;
        var REQUIRED_HITS = 2;
        var START_DELAY_MS = 3000;

        function notify() {
          if (fired) return;
          fired = true;
          try { window.parent.__onDevToolsOpen && window.parent.__onDevToolsOpen(); } catch (e) {}
        }

        setTimeout(function () {
          setInterval(function () {
            if (fired) return;
            var detected = false;
            var probe = { get _() { detected = true; } };
            console.log(probe);
            console.clear();
            if (detected) {
              hits++;
              if (hits >= REQUIRED_HITS) notify();
            } else {
              hits = 0;
            }
          }, 500);
        }, START_DELAY_MS);
      })();
    </script>`;

/* ── 4. Keyboard shortcut blocker (blocks F12 / Ctrl+Shift+I etc.) ──────── */
const KEYBOARD_SCRIPT = `
    <script>
      document.addEventListener('keydown', function (e) {
        if (
          e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase())) ||
          (e.ctrlKey && e.key.toUpperCase() === 'U')
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
    </script>`;

/* ── 5. Full lockdown MutationObserver (hides elements as they render) ───── */
const LOCKDOWN_SCRIPT = `
    <script>
      /* ── JOBJEN ASSESSMENT LOCKDOWN ─────────────────────────────────────
         Selectors confirmed from live DOM inspection.
         MutationObserver re-runs on every DOM change (catches lazy-rendered UI).
      ────────────────────────────────────────────────────────────────── */
      (function () {

        /* Elements to always hide (all known data-jp-item-name variants) */
        var ITEM_NAMES = [
          'new-launcher',
          'new-folder',   'newFolder',
          'upload',       'uploadFiles',
          'new-file',
          'open-path',
          'interfaceSwitcher',
          'executionProgress',
          'kernelName',
          'kernel-name',
          'switch-kernel',
          'kernelStatus',
          'kernelLogs',
          'kernel-logs'
        ];

        /* Blocked text in jp-button aria-label or title (lower-cased fragments) */
        var BLOCKED_BUTTON_TEXT = [
          'new folder',
          'upload',
          'switch kernel',
          'kernel logs',
          'open kernel logs'
        ];

        /* Generic CSS selectors */
        var HIDDEN_SELECTORS = [
          '#jp-MainMenu',
          '#jp-main-statusbar',
          '.jp-StatusBar-widget',
          '.jp-Launcher',
          '.lm-TabBar-addButton',
          '.jp-SideBar .lm-TabBar-tab[data-id="jp-running-sessions"]',
          '.jp-SideBar [title="Running Terminals and Kernels"]',
          '.jp-SideBar .lm-TabBar-tab[data-id="toc"]',
          '.jp-SideBar [title="Table of Contents"]'
        ];

        /* Context menu: only this label is allowed */
        var CONTEXT_ALLOW = ['open'];

        /* Track whether the last right-click was inside the file browser */
        var inFileBrowser = false;
        document.addEventListener('contextmenu', function (e) {
          inFileBrowser = !!(e.target && e.target.closest &&
            (e.target.closest('.jp-DirListing') || e.target.closest('.jp-FileBrowser')));
        }, true);

        function hide(el) {
          el.style.setProperty('display', 'none', 'important');
        }

        function hideElements() {
          /* 1. Hide by data-jp-item-name */
          ITEM_NAMES.forEach(function (name) {
            document.querySelectorAll('[data-jp-item-name="' + name + '"]').forEach(hide);
          });

          /* 2. Hide by generic selectors */
          HIDDEN_SELECTORS.forEach(function (sel) {
            document.querySelectorAll(sel).forEach(hide);
          });

          /* 3. Hide jp-button elements by aria-label/title */
          document.querySelectorAll('jp-button[aria-label], jp-button[title]').forEach(function (btn) {
            var label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
            var blocked = BLOCKED_BUTTON_TEXT.some(function (text) {
              return label.indexOf(text) !== -1;
            });
            if (blocked) {
              hide(btn);
              var wrapper = btn.closest('.jp-Toolbar-item, .jp-CommandToolbarButton');
              if (wrapper) hide(wrapper);
            }
          });

          /* 4. Context menu filtering — keep only "Open" */
          if (inFileBrowser) {
            document.querySelectorAll('.lm-Menu').forEach(function (menu) {
              if (menu._jobjenDone) return;
              var items = menu.querySelectorAll('.lm-Menu-item');
              if (!items.length) return;
              var hasNonOpen = false;
              items.forEach(function (item) {
                var label = item.querySelector('.lm-Menu-itemLabel');
                var text = label ? label.textContent.trim().toLowerCase() : '';
                if (text && CONTEXT_ALLOW.indexOf(text) === -1) hasNonOpen = true;
              });
              if (!hasNonOpen) return;
              items.forEach(function (item) {
                var label = item.querySelector('.lm-Menu-itemLabel');
                var text = label ? label.textContent.trim().toLowerCase() : '';
                var isSeparator = item.classList.contains('lm-Menu-item--divider') ||
                                  item.getAttribute('data-type') === 'separator';
                if (isSeparator || (text && CONTEXT_ALLOW.indexOf(text) === -1)) {
                  hide(item);
                }
              });
              menu._jobjenDone = true;
            });
          }
        }

        /* Run immediately and on every DOM mutation */
        var lockObserver = new MutationObserver(hideElements);

        function startObserving() {
          hideElements();
          lockObserver.observe(document.body, { childList: true, subtree: true });
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', startObserving);
        } else {
          startObserving();
        }
      })();
    </script>`;

/* ── 6. Notebook export bridge (answers the parent app's export request) ──── */
const NOTEBOOK_EXPORT_SCRIPT = `
    <script>
      /* JOBJEN NOTEBOOK EXPORT BRIDGE
         The parent React app postMessages { type:'jobjen:exportNotebooks', id }.
         We walk the JupyterLite Contents API for every .ipynb in the workspace
         and reply { type:'jobjen:notebooks', id, files:[{name, content}] }. */
      (function () {
        function getApp() {
          return window.jupyterapp || window.jupyterlab || null;
        }

        /* Wait for the JupyterLite app + Contents service to be ready, rather
           than failing fast. A submit fired right after a page reload (e.g. the
           deadline lapsed during the reload, triggering an immediate auto-submit)
           reaches here before the freshly-mounted iframe has booted; without this
           the export would reply 'workspace not ready' and the upload would fail
           even though the workspace is seconds from ready. */
        function waitForApp(timeoutMs) {
          var start = Date.now();
          return new Promise(function (resolve, reject) {
            (function tick() {
              var app = getApp();
              if (app && app.serviceManager && app.serviceManager.contents) {
                app.serviceManager.ready
                  ? app.serviceManager.ready.then(function () { resolve(app); }, function () { resolve(app); })
                  : resolve(app);
                return;
              }
              if (Date.now() - start > (timeoutMs || 30000)) {
                reject(new Error('Notebook workspace is not ready.'));
                return;
              }
              setTimeout(tick, 250);
            })();
          });
        }

        async function listNotebooks(contents, path) {
          var model = await contents.get(path, { content: true });
          var out = [];
          if (model.type === 'directory') {
            for (var i = 0; i < (model.content || []).length; i++) {
              out = out.concat(await listNotebooks(contents, model.content[i].path));
            }
          } else if (
            model.type === 'notebook' ||
            (model.name && model.name.toLowerCase().endsWith('.ipynb'))
          ) {
            out.push({ name: model.path || model.name, content: model.content });
          }
          return out;
        }

        async function collect() {
          var app = await waitForApp(30000);
          var contents = app.serviceManager.contents;
          /* Persist any unsaved editor state first, best-effort. */
          try {
            if (app.commands && app.commands.hasCommand('docmanager:save')) {
              await app.commands.execute('docmanager:save');
            }
          } catch (e) {}
          return await listNotebooks(contents, '');
        }

        window.addEventListener('message', function (event) {
          var data = event.data;
          if (!data || data.type !== 'jobjen:exportNotebooks') return;
          var id = data.id;
          collect()
            .then(function (files) {
              window.parent.postMessage(
                { type: 'jobjen:notebooks', id: id, files: files },
                '*'
              );
            })
            .catch(function (err) {
              window.parent.postMessage(
                {
                  type: 'jobjen:notebooks',
                  id: id,
                  files: [],
                  error: (err && err.message) || 'Notebook export failed.'
                },
                '*'
              );
            });
        });
      })();
    </script>`;

/* ── 7. Notebook import bridge (seeds question files into the workspace) ──── */
const NOTEBOOK_IMPORT_SCRIPT = `
    <script>
      /* JOBJEN NOTEBOOK IMPORT BRIDGE
         The parent React app postMessages
           { type:'jobjen:importFiles', id, files:[{name, base64, mime}], open }
         We write each file into the JupyterLite Contents API so it appears in
         the file browser, then (if open) open the primary file. Reply with
         { type:'jobjen:filesImported', id, imported }. */
      (function () {
        function getApp() {
          return window.jupyterapp || window.jupyterlab || null;
        }

        function waitForApp(timeoutMs) {
          var start = Date.now();
          return new Promise(function (resolve, reject) {
            (function tick() {
              var app = getApp();
              if (app && app.serviceManager && app.serviceManager.contents) {
                app.serviceManager.ready
                  ? app.serviceManager.ready.then(function () { resolve(app); }, function () { resolve(app); })
                  : resolve(app);
                return;
              }
              if (Date.now() - start > (timeoutMs || 60000)) {
                reject(new Error('Notebook workspace is not ready.'));
                return;
              }
              setTimeout(tick, 250);
            })();
          });
        }

        var TEXT_EXT = ['.py','.txt','.md','.csv','.json','.html','.js','.ts','.r','.yml','.yaml','.cfg','.ini','.sql'];
        function isTextName(name) {
          var lower = name.toLowerCase();
          for (var i = 0; i < TEXT_EXT.length; i++) {
            if (lower.endsWith(TEXT_EXT[i])) return true;
          }
          return false;
        }
        function b64ToText(b64) {
          var bin = atob(b64);
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new TextDecoder('utf-8').decode(bytes);
        }

        async function importFiles(contents, files) {
          var firstNotebook = null;
          var firstAny = null;
          for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var name = f.name;
            if (firstAny === null) firstAny = name;
            try {
              if (name.toLowerCase().endsWith('.ipynb')) {
                var nb = JSON.parse(b64ToText(f.base64));
                await contents.save(name, { type: 'notebook', format: 'json', content: nb });
                if (firstNotebook === null) firstNotebook = name;
              } else if (isTextName(name)) {
                await contents.save(name, { type: 'file', format: 'text', content: b64ToText(f.base64) });
              } else {
                await contents.save(name, { type: 'file', format: 'base64', content: f.base64 });
              }
            } catch (e) {
              /* skip a single bad file, keep going */
            }
          }
          return { firstNotebook: firstNotebook, firstAny: firstAny };
        }

        window.addEventListener('message', function (event) {
          var data = event.data;
          if (!data || data.type !== 'jobjen:importFiles') return;
          var id = data.id;
          var files = data.files || [];
          var open = data.open;
          waitForApp(60000)
            .then(function (app) {
              return importFiles(app.serviceManager.contents, files).then(function (res) {
                var toOpen = res.firstNotebook || res.firstAny;
                if (open && toOpen) {
                  try { app.commands.execute('docmanager:open', { path: toOpen }); } catch (e) {}
                }
                window.parent.postMessage(
                  { type: 'jobjen:filesImported', id: id, imported: files.length },
                  '*'
                );
              });
            })
            .catch(function (err) {
              window.parent.postMessage(
                {
                  type: 'jobjen:filesImported',
                  id: id,
                  imported: 0,
                  error: (err && err.message) || 'File import failed.'
                },
                '*'
              );
            });
        });
      })();
    </script>`;

/* ── 10. Workspace reset bridge (wipes the store for a new session) ──────── */
const NOTEBOOK_RESET_SCRIPT = `
    <script>
      /* JOBJEN WORKSPACE RESET BRIDGE
         The JupyterLite file system lives in this origin's IndexedDB and is
         shared across every assessment opened in this browser — it is NOT scoped
         per candidate/session. When a NEW session starts, the parent React app
         postMessages { type:'jobjen:resetWorkspace', id } and we delete every
         file and folder in the workspace root so a previous question's files
         can't leak into this one. (A genuine resume of the SAME session never
         sends this, so in-progress work is preserved.) Reply
         { type:'jobjen:workspaceReset', id, deleted }. */
      (function () {
        function getApp() {
          return window.jupyterapp || window.jupyterlab || null;
        }

        function waitForApp(timeoutMs) {
          var start = Date.now();
          return new Promise(function (resolve, reject) {
            (function tick() {
              var app = getApp();
              if (app && app.serviceManager && app.serviceManager.contents) {
                app.serviceManager.ready
                  ? app.serviceManager.ready.then(function () { resolve(app); }, function () { resolve(app); })
                  : resolve(app);
                return;
              }
              if (Date.now() - start > (timeoutMs || 60000)) {
                reject(new Error('Notebook workspace is not ready.'));
                return;
              }
              setTimeout(tick, 250);
            })();
          });
        }

        /* Depth-first delete: empty a directory's children before removing it,
           so drives that refuse to delete a non-empty folder still clear. The
           root ('') is emptied but never itself deleted. */
        async function deletePath(contents, path) {
          var model;
          try { model = await contents.get(path, { content: true }); }
          catch (e) { return 0; }
          var count = 0;
          if (model.type === 'directory') {
            var children = model.content || [];
            for (var i = 0; i < children.length; i++) {
              count += await deletePath(contents, children[i].path);
            }
            if (path) { try { await contents.delete(path); count++; } catch (e) {} }
          } else {
            try { await contents.delete(path); count++; } catch (e) {}
          }
          return count;
        }

        async function reset() {
          var app = getApp();
          if (!app || !app.serviceManager || !app.serviceManager.contents) {
            throw new Error('Notebook workspace is not ready yet.');
          }
          return await deletePath(app.serviceManager.contents, '');
        }

        window.addEventListener('message', function (event) {
          var data = event.data;
          if (!data || data.type !== 'jobjen:resetWorkspace') return;
          var id = data.id;
          waitForApp(60000)
            .then(function () { return reset(); })
            .then(function (deleted) {
              window.parent.postMessage(
                { type: 'jobjen:workspaceReset', id: id, deleted: deleted },
                '*'
              );
            })
            .catch(function (err) {
              window.parent.postMessage(
                {
                  type: 'jobjen:workspaceReset',
                  id: id,
                  deleted: 0,
                  error: (err && err.message) || 'Workspace reset failed.'
                },
                '*'
              );
            });
        });
      })();
    </script>`;

/* ── Apply patches ───────────────────────────────────────────────────────── */
let html = fs.readFileSync(target, "utf8");
let changed = false;

/* Patch 1 — theme stylesheet */
if (!html.includes("jobjen-jupyter-theme.css")) {
  html = html.replace("</head>", `    ${THEME_LINK}\n  </head>`);
  changed = true;
  console.log("[patch-build] ✓ Jobjen theme stylesheet linked");
}

/* Patch 2 — lockdown CSS block */
if (!html.includes("JOBJEN ASSESSMENT LOCKDOWN")) {
  html = html.replace("</head>", `${LOCKDOWN_CSS}\n  </head>`);
  changed = true;
  console.log("[patch-build] ✓ Lockdown CSS injected");
}

/* Patch 3 — DevTools detection */
if (!html.includes("__onDevToolsOpen")) {
  html = html.replace("  </body>", `${DEVTOOLS_SCRIPT}\n  </body>`);
  changed = true;
  console.log("[patch-build] ✓ DevTools detection injected");
}

/* Patch 4 — Keyboard shortcut blocker */
if (!html.includes("stopPropagation")) {
  html = html.replace("  </body>", `${KEYBOARD_SCRIPT}\n  </body>`);
  changed = true;
  console.log("[patch-build] ✓ Keyboard shortcut blocker injected");
}

/* Patch 5 — Full MutationObserver lockdown */
if (!html.includes("ITEM_NAMES")) {
  html = html.replace("  </body>", `${LOCKDOWN_SCRIPT}\n  </body>`);
  changed = true;
  console.log("[patch-build] ✓ MutationObserver lockdown injected");
}

/* Patch 8 — Notebook export bridge */
if (!html.includes("jobjen:exportNotebooks")) {
  html = html.replace("  </body>", `${NOTEBOOK_EXPORT_SCRIPT}\n  </body>`);
  changed = true;
  console.log("[patch-build] ✓ Notebook export bridge injected");
}

/* Patch 9 — Notebook import bridge */
if (!html.includes("jobjen:importFiles")) {
  html = html.replace("  </body>", `${NOTEBOOK_IMPORT_SCRIPT}\n  </body>`);
  changed = true;
  console.log("[patch-build] ✓ Notebook import bridge injected");
}

/* Patch 10 — Workspace reset bridge */
if (!html.includes("jobjen:resetWorkspace")) {
  html = html.replace("  </body>", `${NOTEBOOK_RESET_SCRIPT}\n  </body>`);
  changed = true;
  console.log("[patch-build] ✓ Workspace reset bridge injected");
}

/*
 * Patch 6 — Fix JupyterLite service worker URL
 *
 * The JupyterLite build generates lab/lab/index.html which references
 * the service worker as "./sw.js" — this resolves to lab/lab/sw.js
 * but the actual file is at lab/sw.js (one level up).
 * Fix: replace "./sw.js" → "../sw.js" in the inline config script.
 */
if (!html.includes('"../sw.js"') && !html.includes("'../sw.js'")) {
  const before = html;
  // The SW URL appears inside the jupyter-config-data JSON
  html = html.replace(/"serviceWorkerUrl"\s*:\s*"\.\/sw\.js"/g, '"serviceWorkerUrl": "../sw.js"');
  html = html.replace(/'serviceWorkerUrl'\s*:\s*'\.\/'\+'sw\.js'/g, "'serviceWorkerUrl': '../sw.js'");
  // Also catch bare ./sw.js in any attribute or script context
  html = html.replace(/(["'])\.\/sw\.js\1/g, (m, q) => `${q}../sw.js${q}`);
  if (html !== before) {
    changed = true;
    console.log("[patch-build] ✓ JupyterLite service worker URL patched (./sw.js → ../sw.js)");
  } else {
    console.log("[patch-build] ℹ Service worker URL not found (may already be correct or absent)");
  }
}

/*
 * Patch 7 — Fix jupyter-config-data:
 *   a) Remove crashing plugin overrides (filebrowser, notebook-tracker)
 *   b) Enforce JupyterLab Dark theme — keeps local dev + deployed in sync
 */
const CRASH_KEYS = [
  '@jupyterlab/filebrowser-extension:browser',
  '@jupyterlab/notebook-extension:tracker',
];

const FORCED_OVERRIDES = {
  '@jupyterlab/apputils-extension:themes': { theme: 'JupyterLab Dark' },
};

try {
  const configMatch = html.match(/<script[\s\S]*?id=["']jupyter-config-data["'][\s\S]*?>([\s\S]*?)<\/script>/);
  if (configMatch) {
    let config;
    try {
      config = JSON.parse(configMatch[1]);
    } catch {
      console.warn('[patch-build] ⚠ Could not parse jupyter-config-data JSON — skipping Patch 7');
      config = null;
    }
    if (config) {
      let configChanged = false;

      // Ensure settingsOverrides exists
      if (!config.settingsOverrides) {
        config.settingsOverrides = {};
        configChanged = true;
      }

      // (0) Expose the JupyterLab/Lite app instance on `window.jupyterapp` so
      //     the Jobjen import/export bridges (Patch 8 / 9) can reach the
      //     Contents API. Without this flag JupyterLite sets no global and the
      //     bridges have no way to read/write notebooks.
      if (config.exposeAppInBrowser !== true) {
        config.exposeAppInBrowser = true;
        configChanged = true;
        console.log('[patch-build] ✓ exposeAppInBrowser enabled (window.jupyterapp)');
      }

      // (a) Remove crashing keys
      CRASH_KEYS.forEach((key) => {
        if (config.settingsOverrides[key]) {
          delete config.settingsOverrides[key];
          configChanged = true;
          console.log(`[patch-build] ✓ Removed crashing override: ${key}`);
        }
      });

      // (b) Enforce dark theme and any other required overrides
      Object.entries(FORCED_OVERRIDES).forEach(([key, value]) => {
        const existing = JSON.stringify(config.settingsOverrides[key]);
        const desired  = JSON.stringify(value);
        if (existing !== desired) {
          config.settingsOverrides[key] = value;
          configChanged = true;
          console.log(`[patch-build] ✓ Set forced override: ${key} =`, JSON.stringify(value));
        }
      });

      if (configChanged) {
        const newJson = JSON.stringify(config, null, 2);
        const fullTag = configMatch[0];
        const newTag  = fullTag.replace(configMatch[1], '\n' + newJson + '\n');
        html = html.replace(fullTag, newTag);
        changed = true;
      }
    }
  } else {
    console.log('[patch-build] ℹ jupyter-config-data script not found — skipping Patch 7');
  }
} catch (e) {
  console.warn('[patch-build] ⚠ Patch 7 error (non-fatal):', e.message);
}

if (!changed) {
  console.log("[patch-build] All patches already applied — nothing to do.");
}

fs.writeFileSync(target, html, "utf8");
console.log("[patch-build] Done →", target);
