// The `electron` package has no postinstall script (since Electron 44), and
// pnpm blocks unapproved install scripts anyway, so `pnpm install` leaves
// node_modules/electron without its binary. electron-vite then fails with
// "Error: Electron uninstall". This runs Electron's own download script when
// the binary is missing. Runs first in the dev / build / start / dist scripts.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = path.join(root, 'node_modules', 'electron')
const pathTxt = path.join(electronDir, 'path.txt')

function binaryPresent() {
  if (!existsSync(pathTxt)) return false
  return existsSync(path.join(electronDir, 'dist', readFileSync(pathTxt, 'utf8').trim()))
}

if (!existsSync(electronDir)) {
  console.error('node_modules/electron is missing; run `pnpm install` first.')
  process.exit(1)
}
if (!binaryPresent()) {
  console.log('Electron binary not found (install scripts were probably blocked); downloading it now...')
  execFileSync(process.execPath, [path.join(electronDir, 'install.js')], { stdio: 'inherit', cwd: electronDir })
  if (!binaryPresent()) {
    console.error('Electron download failed. Try: pnpm approve-builds && pnpm rebuild electron')
    process.exit(1)
  }
}

// Linux: Chromium needs either unprivileged user namespaces or a setuid
// sandbox helper. Ubuntu 24.04+ restricts user namespaces by default, so the
// helper must be root-owned with mode 4755, which pnpm cannot set. This script cannot
// fix that without root either, so explain it before Electron aborts with a
// FATAL sandbox error.
if (process.platform === 'linux') {
  const helper = path.join(electronDir, 'dist', 'chrome-sandbox')
  let restricted = false
  try {
    restricted = readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'
  } catch {
    // Not Ubuntu-style AppArmor; assume user namespaces are available.
  }
  if (restricted && existsSync(helper)) {
    const st = statSync(helper)
    const ok = st.uid === 0 && (st.mode & 0o4755) === 0o4755
    if (!ok) {
      console.warn(
        [
          'This kernel restricts unprivileged user namespaces, so Electron needs its setuid sandbox helper.',
          'Run once (and again after any pnpm install that replaces node_modules/electron):',
          `  sudo chown root:root ${helper} && sudo chmod 4755 ${helper}`,
          'Alternative (system-wide, less secure): sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0',
        ].join('\n'),
      )
    }
  }
}
