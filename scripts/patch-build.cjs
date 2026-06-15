const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '../react-app/public/lab/lab/index.html');

if (!fs.existsSync(target)) {
  console.error('target not found:', target);
  console.error('Run: jupyter lite build --output-dir react-app/public/lab');
  process.exit(1);
}

const scriptInject = `
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
    </script>
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
    </script>
    <script>
      (function () {
        var BLOCKED = ['download', 'open in new browser tab', 'open in new tab'];
        function hideDownloadItems() {
          document.querySelectorAll('.lm-Menu-item').forEach(function (item) {
            var label = item.querySelector('.lm-Menu-itemLabel');
            if (label && BLOCKED.indexOf(label.textContent.trim().toLowerCase()) !== -1) {
              item.style.display = 'none';
            }
          });
        }
        var observer = new MutationObserver(hideDownloadItems);
        document.addEventListener('DOMContentLoaded', function () {
          observer.observe(document.body, { childList: true, subtree: true });
        });
        if (document.readyState !== 'loading') {
          observer.observe(document.body, { childList: true, subtree: true });
        }
      })();
    </script>`;

const themeLink = '<link rel="stylesheet" href="../../jobjen-jupyter-theme.css" />';

let html = fs.readFileSync(target, 'utf8');
let changed = false;

if (!html.includes('jobjen-jupyter-theme.css')) {
  if (html.includes('</head>')) {
    html = html.replace('</head>', `    ${themeLink}\n  </head>`);
  } else {
    html = html.replace('<body>', `${themeLink}\n  <body>`);
  }
  changed = true;
  console.log('patch applied: Jobjen theme stylesheet linked');
}

if (!html.includes('hideDownloadItems')) {
  html = html.replace('  </body>', scriptInject + '\n  </body>');
  changed = true;
  console.log('patch applied: keyboard shortcuts blocked + download disabled in JupyterLite');
}

if (!changed) {
  console.log('patch already applied, skipping');
}

fs.writeFileSync(target, html, 'utf8');
