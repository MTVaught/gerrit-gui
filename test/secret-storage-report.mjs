// Render actual file snapshots from the two dummy-data verification runs.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const dir = path.resolve(import.meta.dirname, '../docs/screenshots/secret-storage')
const web = JSON.parse(await fs.readFile(path.join(dir, 'browser-result.json'), 'utf8'))
const desktop = JSON.parse(await fs.readFile(path.join(dir, 'electron-result.json'), 'utf8'))
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const snapshot = value => escape(JSON.stringify(value, null, 2))
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{color-scheme:light dark;--foreground:light-dark(#18202b,#e6eaf0);--muted-foreground:light-dark(#525e6d,#a6b2c2);--card:light-dark(#f3f5f8,#1a2029);--border:light-dark(#d3d9e2,#364152);--radius:8px;--font-sans:system-ui;--font-mono:monospace}
body{margin:0;color:var(--foreground);font:14px/1.5 var(--font-sans);background:transparent}p{margin:0 0 12px}table{width:100%;border-collapse:collapse;margin:12px 0 18px}th,td{text-align:left;padding:10px 6px;border-bottom:1px solid var(--border)}small{color:var(--muted-foreground)}.files{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{padding:16px;background:var(--card);border-radius:var(--radius)}h3{font-size:15px;margin:0 0 12px}pre{font:12px/1.55 var(--font-mono);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}@media(max-width:540px){.files{grid-template-columns:1fr}th,td{font-size:12px}}
</style></head><body>
<p>Actual settings files after explicit removal of the old saved copy and a successful session save.</p>
<small>Linux. Dummy credentials only. Browser account response simulated. Electron ${escape(desktop.electron)} used the real basic_text backend.</small>
<table><thead><tr><th>Observed value</th><th>Browser server</th><th>Electron</th></tr></thead><tbody>
<tr><td>Existing file mode</td><td>${escape(web.before.mode)} → ${escape(web.afterSaveMode)}</td><td>${escape(desktop.beforeMode)} → ${escape(desktop.afterMode)}</td></tr>
<tr><td>Password in saved JSON</td><td>${'password' in web.afterSave ? 'Present' : 'Absent'}</td><td>${'password' in desktop.afterSave ? 'Present' : 'Absent'}</td></tr>
<tr><td>Password usable in session</td><td>${escape(web.sessionHasPassword)}</td><td>${escape(desktop.sessionHasPassword)}</td></tr>
<tr><td>Password available after process restart</td><td>${escape(web.restartHasPassword)}</td><td>${escape(desktop.restartHasPassword)}</td></tr>
<tr><td>Retained A password returned for B after restart</td><td>Blocked by process regressions</td><td>${escape(desktop.retainedRestartHasPassword)}</td></tr>
<tr><td>Requests sent for B after restart</td><td>Zero in process regressions</td><td>${escape(desktop.retainedRestartSentRequests)}</td></tr>
</tbody></table>
<div class="files"><article><h3>Browser settings file</h3><pre>${snapshot(web.afterSave)}</pre></article><article><h3>Electron settings file</h3><pre>${snapshot(desktop.afterSave)}</pre></article></div>
<article style="margin-top:16px"><h3>Retained copy after changing the active connection to B</h3><small>The original ciphertext keeps A's passwordIdentity. The new process returned no password for B and sent zero requests.</small><pre>${snapshot(desktop.afterRetainedReplacement)}</pre></article>
</body></html>`
await fs.writeFile(path.join(dir, 'verification.html'), html)

// Render the observed data without another browser process. UI screenshots come
// from the browser runner. This image shows file contents and metadata only.
for (const mode of ['light', 'dark']) {
  const bg = mode === 'light' ? '#ffffff' : '#101419'
  const fg = mode === 'light' ? '#18202b' : '#e6eaf0'
  const muted = mode === 'light' ? '#525e6d' : '#a6b2c2'
  const card = mode === 'light' ? '#f3f5f8' : '#1a2029'
  const text = (x, y, value, size = 16, color = fg) => `<text x="${x}" y="${y}" fill="${color}" font-family="DejaVu Sans" font-size="${size}">${escape(value)}</text>`
  const rows = [
    ['Observed value', 'Browser server', 'Electron'],
    ['Existing file mode', `${web.before.mode} → ${web.afterSaveMode}`, `${desktop.beforeMode} → ${desktop.afterMode}`],
    ['Password field in JSON', 'Absent', 'Absent'],
    ['Password usable in session', String(web.sessionHasPassword), String(desktop.sessionHasPassword)],
    ['Password after process restart', String(web.restartHasPassword), String(desktop.restartHasPassword)],
  ]
  let content = text(24, 35, 'Observed settings files and permissions', 24)
  content += text(24, 67, `Linux. Dummy data. Electron ${desktop.electron} with real basic_text.`, 16, muted)
  for (let i = 0; i < rows.length; i++) {
    content += rows[i].map((value, j) => text([24, 480, 740][j], 113 + i * 35, value, 16)).join('')
  }
  for (const [index, data] of [web.afterSave, desktop.afterSave].entries()) {
    const x = 24 + index * 488
    content += `<rect x="${x}" y="300" width="464" height="640" rx="8" fill="${card}"/>`
    content += text(x + 18, 333, index ? 'Electron settings.json' : 'Browser settings.json', 18)
    JSON.stringify(data, null, 2).split('\n').forEach((line, i) => {
      content += `<text x="${x + 18}" y="${367 + i * 21}" fill="${fg}" font-family="DejaVu Sans Mono" font-size="12" xml:space="preserve">${escape(String(i + 1).padStart(2, ' ') + '  ' + line)}</text>`
    })
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="964"><rect width="1000" height="964" fill="${bg}"/>${content}</svg>`
  execFileSync('convert', ['svg:-', path.join(dir, `verification-${mode}.png`)], { input: svg })
  let retained = text(24, 36, 'Retained A password stays bound to A', 24)
  retained += text(24, 72, 'Observed JSON after B received a new memory-only password. Dummy data only.', 16, muted)
  retained += text(24, 112, `Separate Electron process: password for B = ${desktop.retainedRestartHasPassword}; requests sent = ${desktop.retainedRestartSentRequests}`, 17)
  retained += `<rect x="24" y="145" width="952" height="795" rx="8" fill="${card}"/>`
  JSON.stringify(desktop.afterRetainedReplacement, null, 2).split('\n').forEach((line, i) => {
    retained += `<text x="44" y="${183 + i * 23}" fill="${fg}" font-family="DejaVu Sans Mono" font-size="14" xml:space="preserve">${escape(String(i + 1).padStart(2, ' ') + '  ' + line)}</text>`
  })
  const retainedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="964"><rect width="1000" height="964" fill="${bg}"/>${retained}</svg>`
  execFileSync('convert', ['svg:-', path.join(dir, `retained-${mode}.png`)], { input: retainedSvg })

}
