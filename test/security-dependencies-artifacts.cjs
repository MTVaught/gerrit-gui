// Run after both builds and electron-builder --dir --linux --publish never.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fromBuilder = createRequire(require.resolve('electron-builder/package.json'))
const asar = fromBuilder('@electron/asar')
const root = path.join(__dirname, '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function inspect(label, entries) {
  const scripts = entries.filter(([name]) => name.endsWith('.js'))
  assert.ok(scripts.some(([, text]) => /version\s*=\s*["']3\.4\.17["']/.test(text)), `${label} contains the fixed sanitizer`)
  assert.ok(scripts.every(([, text]) => !text.includes('3.4.15')), `${label} has no old DOMPurify version`)
  return { label, scripts: scripts.length, dompurify: '3.4.17', oldVersionFound: false }
}
const results = []
for (const mode of ['renderer', 'web']) {
  const dir = path.join(root, 'out', mode, 'assets')
  results.push(inspect(mode, fs.readdirSync(dir).filter(name => name.endsWith('.js')).map(name => [name, fs.readFileSync(path.join(dir, name), 'utf8')])))
}
const archive = path.join(root, 'dist/linux-unpacked/resources/app.asar')
const files = asar.listPackage(archive).map(name => name.replace(/^\//, ''))
for (const pkg of ['monaco-editor', 'sprintf-js', 'global-agent']) {
  assert.ok(!files.some(name => name.includes(`node_modules/${pkg}/`)), `${pkg} is not shipped as a separate package`)
}
const rendererAssets = files.filter(name => name.startsWith('out/renderer/assets/') && name.endsWith('.js'))
assert.ok(rendererAssets.length > 0)
for (const name of rendererAssets) {
  assert.equal(sha256(asar.extractFile(archive, name)), sha256(fs.readFileSync(path.join(root, name))), `${name} matches the current renderer build`)
}
for (const name of ['out/main/index.js', 'out/preload/index.js']) {
  assert.equal(sha256(asar.extractFile(archive, name)), sha256(fs.readFileSync(path.join(root, name))), `${name} matches the current main/preload build`)
}
results.push(inspect('app.asar', files.filter(name => name.endsWith('.js')).map(name => [name, asar.extractFile(archive, name).toString()])))
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), buildSourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  baseCommit: execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: root, encoding: 'utf8' }).trim(),
  archive: { path: 'dist/linux-unpacked/resources/app.asar', bytes: fs.statSync(archive).size, sha256: sha256(fs.readFileSync(archive)) },
  lockfileSha256: sha256(fs.readFileSync(path.join(root, 'pnpm-lock.yaml'))), patchSha256: sha256(fs.readFileSync(path.join(root, 'patches/monaco-editor@0.57.0.patch'))),
  results, currentRendererAssetsMatch: rendererAssets.length, currentMainAndPreloadMatch: true, unusedMonacoDistributionShipped: false, buildProxyLoggerShipped: false }, null, 2))
