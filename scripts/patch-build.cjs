const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '../react-app/public/lab/lab/index.html');

const inject = `
    <script>
      (function () {
        var fired = false;
        function notify() {
          if (fired) return;
          fired = true;
          try { window.parent.__onDevToolsOpen && window.parent.__onDevToolsOpen(); } catch (e) {}
        }
        setInterval(function () {
          if (fired) return;
          if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
            notify(); return;
          }
          var detected = false;
          var probe = { get _() { detected = true; } };
          console.log(probe);
          console.clear();
          if (detected) notify();
        }, 500);
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

let html = fs.readFileSync(target, 'utf8');

if (html.includes('hideDownloadItems')) {
  console.log('patch already applied, skipping');
  process.exit(0);
}

html = html.replace('  </body>', inject + '\n  </body>');
fs.writeFileSync(target, html, 'utf8');
console.log('patch applied: keyboard shortcuts blocked + download disabled in JupyterLite');
