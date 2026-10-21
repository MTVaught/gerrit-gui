// Loopback Gerrit fixture for the real desktop app. No production API is replaced.
const http = require('node:http')
const fs = require('node:fs')
const vm = require('node:vm')
let api
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, 'local-review-preload.cjs'), 'utf8'), {
  require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value } } }),
  process: { env: { REVIEW_FIXTURE_NOW: '2026-10-20 12:00:00.000' } }, setTimeout, Map, Date, console,
})
const port = Number(process.env.NATIVE_REVIEW_PORT || 5197)
const audit = value => { if (process.env.NATIVE_REVIEW_AUDIT) fs.appendFileSync(process.env.NATIVE_REVIEW_AUDIT, JSON.stringify(value) + '\n') }
async function start() {
  const { self, open } = await api.fetchDashboard()
  const change = open[0]
  change.mergeable = true
  change.permitted_labels = { 'Code-Review': ['-1', '0', '+1'] }
  change.revisions['prior-1'] = { _number: 1, created: change.created }
  change.revisions['prior-2'] = { _number: 2, created: change.created }
  change.messages = [{ id: 'prior-review', author: self, _revision_number: 1, date: change.created, message: 'Patch Set 1: Code-Review+1' }]
  change.custom_keyed_values['review-requested-ps'] = '1,3'
  http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1:' + port)
      const pathname = decodeURIComponent(url.pathname.replace(/^\/a/, ''))
      audit({ method: req.method, path: url.pathname, query: url.search })
      if (url.pathname.startsWith('/c/')) {
        const comparison = url.pathname.split('/').at(-1)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!doctype html><html><head><title>Gerrit fixture review</title><style>body{font:20px system-ui;max-width:1000px;margin:60px auto;padding:24px;color:#20242c;background:#fff}small{color:#555}pre{padding:24px;background:#f1f4f8} @media(prefers-color-scheme:dark){body{background:#181b20;color:#eef1f6}small{color:#bac2ce}pre{background:#242a33}}</style></head><body><small>Simulated Gerrit server · Browser destination</small><h1>#2481 · Keep telemetry batches bounded under load</h1><p>Comparison: ${comparison}</p><pre>- if (pending.length &gt; maxBatchSize)\n+ if (pending.length &gt;= maxBatchSize)</pre><p>The app opened this Gerrit URL in the external browser.</p></body></html>`)
        return
      }
      let result
      if (pathname === '/accounts/self') result = self
      else if (pathname === '/accounts/self/capabilities') result = {}
      else if (pathname === '/changes/') result = url.searchParams.getAll('q').map((_, i) => i === 0 ? [change] : [])
      else if (pathname === '/changes/2481/detail') result = change
      else if (/\/mergeable$/.test(pathname)) result = { mergeable: true }
      else if (/\/(comments|drafts|ported_comments|ported_drafts)$/.test(pathname)) result = {}
      else if (/\/reviewed$/.test(pathname)) { res.writeHead(204).end(); return }
      else if (/\/files$/.test(pathname)) result = url.searchParams.has('reviewed') ? [] : { 'src/telemetry/batch-scheduler.ts': { lines_inserted: 3, lines_deleted: 2 } }
      else if (/\/diff$/.test(pathname)) {
        const patchSet = Number(pathname.match(/\/revisions\/(\d+)/)[1])
        result = { meta_a: { name: 'src/telemetry/batch-scheduler.ts' }, meta_b: { name: 'src/telemetry/batch-scheduler.ts' }, content: [
          { ab: [`// Comparing patch set ${url.searchParams.get('base') || 'base'} to patch set ${patchSet}`, '', 'export class BatchScheduler {', '  enqueue(event: Event): void {', '    this.pending.push(event);'] },
          { a: ['    if (this.pending.length > this.options.maxBatchSize) {'], b: ['    if (this.pending.length >= this.options.maxBatchSize) {'] },
          { ab: ['      void this.flush();', '    }', '  }', '', '  async flush(): Promise<void> {'] },
          { a: ['    const batch = this.pending;', '    this.pending = [];'], b: ['    const batch = this.pending.splice(0, this.options.maxBatchSize);', '    if (batch.length === 0) return;'] },
          { ab: ['    await this.transport.send(batch);', '  }', '}'] },
        ] }
      } else { res.writeHead(404).end('No fixture for ' + pathname); return }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    } catch (error) { res.writeHead(500).end(String(error)) }
  }).listen(port, '127.0.0.1', () => console.log('Native review Gerrit fixture on ' + port))
}
start().catch(error => { console.error(error); process.exit(1) })
