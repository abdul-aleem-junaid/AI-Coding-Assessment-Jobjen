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

const fs   = require('fs');
const path = require('path');

const target = path.join(__dirname, '../react-app/public/lab/lab/index.html');

if (!fs.existsSync(target)) {
  console.error('[patch-build] ERROR — target not found:', target);
  console.error('Run: jupyter lite build --output-dir react-app/public/lab');
  process.exit(1);
}

/* ── 1. Theme stylesheet link ───────────────────────────────────────────── */
const THEME_LINK = '<link rel="stylesheet" href="../../jobjen-jupyter-theme.css" />';

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

/* ── Apply patches ───────────────────────────────────────────────────────── */
let html = fs.readFileSync(target, 'utf8');
let changed = false;

/* Patch 1 — theme stylesheet */
if (!html.includes('jobjen-jupyter-theme.css')) {
  html = html.replace('</head>', `    ${THEME_LINK}\n  </head>`);
  changed = true;
  console.log('[patch-build] ✓ Jobjen theme stylesheet linked');
}

/* Patch 2 — lockdown CSS block */
if (!html.includes('JOBJEN ASSESSMENT LOCKDOWN')) {
  // Insert the CSS just before </head>
  html = html.replace('</head>', `${LOCKDOWN_CSS}\n  </head>`);
  changed = true;
  console.log('[patch-build] ✓ Lockdown CSS injected');
}

/* Patch 3 — DevTools detection */
if (!html.includes('__onDevToolsOpen')) {
  html = html.replace('  </body>', `${DEVTOOLS_SCRIPT}\n  </body>`);
  changed = true;
  console.log('[patch-build] ✓ DevTools detection injected');
}

/* Patch 4 — Keyboard shortcut blocker */
if (!html.includes('stopPropagation')) {
  html = html.replace('  </body>', `${KEYBOARD_SCRIPT}\n  </body>`);
  changed = true;
  console.log('[patch-build] ✓ Keyboard shortcut blocker injected');
}

/* Patch 5 — Full MutationObserver lockdown */
if (!html.includes('ITEM_NAMES')) {
  html = html.replace('  </body>', `${LOCKDOWN_SCRIPT}\n  </body>`);
  changed = true;
  console.log('[patch-build] ✓ MutationObserver lockdown injected');
}

if (!changed) {
  console.log('[patch-build] All patches already applied — nothing to do.');
}

fs.writeFileSync(target, html, 'utf8');
console.log('[patch-build] Done →', target);
