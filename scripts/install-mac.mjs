// Copies the built .app bundle into the macOS Applications folder.
// Runs last in `pnpm run install:mac`, after `electron-builder --mac dir`
// has produced dist/mac*/<productName>.app.
//
//   INSTALL_DIR   target folder (default /Applications; use ~/Applications
//                 if you are not an admin)
import { existsSync, readdirSync, rmSync, cpSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = createRequire(import.meta.url)(path.join(root, 'package.json'))
const appName = `${pkg.build.productName}.app`
const target = path.join(process.env['INSTALL_DIR'] ?? '/Applications', appName)

if (process.platform !== 'darwin' && !process.env['INSTALL_DIR']) {
  console.error('install:mac only runs on macOS (set INSTALL_DIR to test the copy elsewhere).')
  process.exit(1)
}

// electron-builder writes dist/mac/ on x64 and dist/mac-arm64/ on Apple silicon.
const dist = path.join(root, 'dist')
const built = readdirSync(dist)
  .filter((d) => d === 'mac' || d.startsWith('mac-'))
  .map((d) => path.join(dist, d, appName))
  .find((p) => existsSync(p))
if (!built) {
  console.error(`No ${appName} under dist/mac*/. Run \`pnpm run install:mac\` rather than this script directly.`)
  process.exit(1)
}

if (process.platform === 'darwin') {
  // Quit a running copy so the bundle can be replaced; ignore "not running".
  spawnSync('osascript', ['-e', `tell application "${pkg.build.productName}" to quit`], { stdio: 'ignore' })
}

if (existsSync(target)) rmSync(target, { recursive: true, force: true })
if (process.platform === 'darwin') {
  // ditto preserves symlinks, resource forks and the code signature.
  execFileSync('ditto', [built, target], { stdio: 'inherit' })
} else {
  cpSync(built, target, { recursive: true, verbatimSymlinks: true })
}
console.log(`Installed ${target}`)
