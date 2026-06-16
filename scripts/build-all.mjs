// scripts/build-all.mjs
//
// Builds the whole deployable bundle in one command:
//   1. JupyterLite  → react-app/public/lab   (python -m jupyter lite build)
//   2. Patch the generated lab/lab/index.html (lockdown + import/export bridges)
//   3. Vite build   → react-app/dist          (npm --prefix react-app run build)
//
// Used by Vercel as the `buildCommand` (see vercel.json) and locally via
// `npm run build`. Assumes deps are already installed (run `npm run install:all`
// first, or rely on Vercel's installCommand).
//
// Cross-platform like install-all.mjs: probes python3/python, runs everything
// from the repo root with relative, space-free args.
//
// Windows note: JupyterLite writes deeply nested federated-extension paths that
// exceed the legacy 260-char MAX_PATH. Enable long paths once with (admin):
//   reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f
// (already set on the dev machine). Vercel's Linux build is unaffected.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IS_WIN = process.platform === 'win32'
const LAB_INDEX = join(ROOT, 'react-app', 'public', 'lab', 'lab', 'index.html')

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts })
  if (res.error) throw res.error
  if (res.status !== 0) {
    console.error(`\n✗ "${cmd} ${args.join(' ')}" exited with code ${res.status}`)
    process.exit(res.status ?? 1)
  }
}

function findPython() {
  for (const cmd of ['python3', 'python']) {
    const probe = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
    if (!probe.error && probe.status === 0) return cmd
  }
  console.error('✗ No Python interpreter found (tried python3, python). Install Python 3.')
  process.exit(1)
}

// npm is `npm.cmd` on Windows, which requires a shell. We pass the whole command
// as ONE string (not args + shell:true together) to avoid Node's DEP0190 warning.
function runNpm(args, opts = {}) {
  if (IS_WIN) run(['npm', ...args].join(' '), [], { shell: true, ...opts })
  else run('npm', args, opts)
}

const py = findPython()
console.log(`Using Python: ${py}`)

// 1. Build JupyterLite into the React app's public/ folder.
run(py, ['-m', 'jupyter', 'lite', 'build', '--output-dir', 'react-app/public/lab'])

// Fail fast if the build didn't produce the page we patch next.
if (!existsSync(LAB_INDEX)) {
  console.error(`\n✗ JupyterLite build did not produce ${LAB_INDEX}`)
  process.exit(1)
}
console.log('✓ JupyterLite build output OK')

// 2. Inject the lockdown CSS, keyboard/devtools guards, and the notebook
//    import/export bridges into the generated lab/lab/index.html.
run(process.execPath, ['scripts/patch-build.cjs'])

// 3. Build the React app (Vite copies public/lab into dist verbatim).
runNpm(['--prefix', 'react-app', 'run', 'build'])

console.log('\n✓ Build complete → react-app/dist')
