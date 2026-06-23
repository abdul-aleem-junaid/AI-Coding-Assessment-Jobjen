// scripts/install-all.mjs
//
// Installs EVERY dependency for a from-scratch build, in one command:
//   1. Python deps (the JupyterLite toolchain) from requirements.txt
//   2. Node deps for the React app (react-app/)
//
// Used by Vercel as the `installCommand` (see vercel.json) and locally via
// `npm run install:all`. Cross-platform: it probes for `python3` then `python`
// (Vercel/Linux ships python3; Windows usually `python`).
//
// Implementation note: every command runs with `cwd` set to the repo root and
// only RELATIVE, space-free arguments, so the spaces in this project's absolute
// path never reach a shell. Python/node are spawned with shell:false; npm is
// spawned through a shell on Windows only (npm is `npm.cmd` there).

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IS_WIN = process.platform === 'win32'

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

// 1. JupyterLite toolchain.
// --break-system-packages: Vercel's build-image Python is "externally managed"
// (PEP 668, managed by uv), which refuses a plain `pip install`. The build
// container is ephemeral so overriding the marker is safe; the flag is a no-op
// on a normal local Python (pip >= 23).
run(py, ['-m', 'pip', 'install', '--break-system-packages', '-r', 'requirements.txt'])

// 2. React app Node deps — `npm ci` when a lockfile exists, else `npm install`.
const hasLock = existsSync(join(ROOT, 'react-app', 'package-lock.json'))
runNpm(['--prefix', 'react-app', hasLock ? 'ci' : 'install'])

console.log('\n✓ All dependencies installed.')
