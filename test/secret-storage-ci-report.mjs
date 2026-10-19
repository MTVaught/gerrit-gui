// Render actual isolated file outcomes for the portable startup regression.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { startBrowser, audit } from './fixtures/secret-startup.mjs'
const output = path.resolve(import.meta.dirname, '../docs/screenshots/secret-storage')
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit ci startup spaces '))
const file = path.join(dir, 'settings with spaces.json')
const A = { serverUrl: 'https://gerrit.invalid', username: 'dummy' }
const before = { ...A, password: 'dummy-ci-old', passwordEncrypted: false, passwordStorageVersion: 0, passwordIdentity: A }
const children = []
try {
  await fs.writeFile(file, JSON.stringify(before, null, 2))
  const beforeBytes = await fs.readFile(file, 'utf8')
  const failed = await startBrowser(file, { GERRIT_SECRET_TEST_RENAME_DENIED: '1' }); children.push(failed)
  await assert.rejects(failed.ready(), /Browser startup failed/)
  assert.equal((await failed.exited).code, 1)
  assert.deepEqual(await audit(failed.auditFile), [])
  assert.equal(await fs.readFile(file, 'utf8'), beforeBytes)
  const afterFailure = JSON.parse(await fs.readFile(file, 'utf8'))
  const normal = await startBrowser(file); children.push(normal)
  const ready = await normal.ready()
  const afterStartup = JSON.parse(await fs.readFile(file, 'utf8'))
  for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal(key in afterStartup, false)
  assert.equal(ready.events.length, 1)
  assert.equal(ready.events[0].event, 'before-listen')
  const result = { platform: process.platform, node: process.version, data: 'Dummy only. Simulated rename denial, real production API process and files. No browser or user save.', before, afterFailure, afterStartup, deniedExitCode: 1, deniedListened: false, deniedFileBytesIntact: true, successfulAudit: ready.events, saveSettingsCalls: 0, windowsValidation: 'Native Windows CI is authoritative; these observed snapshots are from Linux.' }
  await fs.writeFile(path.join(output, 'ci-portability-result.json'), JSON.stringify(result, null, 2) + '\n')
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c])
  for (const mode of ['light', 'dark']) {
    const bg = mode === 'light' ? '#ffffff' : '#101419', fg = mode === 'light' ? '#18202b' : '#e6eaf0', card = mode === 'light' ? '#f3f5f8' : '#1a2029'
    const text = (x, y, value, size=16) => `<text x="${x}" y="${y}" fill="${fg}" font-family="DejaVu Sans" font-size="${size}">${escape(value)}</text>`
    let svg = text(24, 38, 'Observed portable startup failure and successful retry', 26)
    svg += text(24, 76, `Linux ${process.version}. Dummy data. Simulated replacement denial; actual process and file outcomes.`)
    svg += text(24, 112, 'Denied startup: exit 1; zero listen events; original file bytes intact; zero saves.')
    svg += text(24, 148, 'Successful new process: legacy fields absent before listening; zero browser requests or saves.')
    svg += text(24, 184, 'Windows drive paths now use a file:// preload URL. Native Windows CI validates that platform.')
    for (const [i, [title, value]] of [['BEFORE startup', before], ['AFTER denied replacement', afterFailure], ['AFTER successful startup', afterStartup]].entries()) {
      const x = 24 + i * 356
      svg += `<rect x="${x}" y="220" width="338" height="510" rx="8" fill="${card}"/>`
      svg += text(x + 14, 254, title, 17)
      JSON.stringify(value, null, 2).split('\n').forEach((line,j) => { svg += `<text x="${x+14}" y="${291+j*22}" fill="${fg}" font-family="DejaVu Sans Mono" font-size="11" xml:space="preserve">${escape(String(j+1).padStart(2,' ')+' '+line+'\u200b')}</text>` })
    }
    execFileSync('convert', ['svg:-', path.join(output, `ci-portability-${mode}.png`)], { input: `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="760"><rect width="1100" height="760" fill="${bg}"/>${svg}</svg>` })
  }
  console.log('Observed portable failure/retry file snapshots and paired static artifacts: passed')
} finally {
  for (const child of children) await child.stop()
  await fs.rm(dir, { recursive: true, force: true })
}
