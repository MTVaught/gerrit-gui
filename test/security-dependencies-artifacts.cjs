// Run after both builds and electron-builder --dir --linux --publish never.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const fromBuilder = createRequire(require.resolve('electron-builder/package.json'))
const asar = fromBuilder('@electron/asar')
const root = path.join(__dirname, '..')

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
  assert.ok(!files.some(name => name.startsWith(`node_modules/${pkg}/`)), `${pkg} is not shipped as a separate package`)
}
results.push(inspect('app.asar', files.filter(name => name.endsWith('.js')).map(name => [name, asar.extractFile(archive, name).toString()])))
console.log(JSON.stringify({ results, unusedMonacoDistributionShipped: false, buildProxyLoggerShipped: false }, null, 2))
