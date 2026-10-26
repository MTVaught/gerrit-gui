// Simulated loopback Gerrit. The desktop uses its production service and preload.
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

async function startReviewServer(port = 0) {
  let fixture
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'local-review-preload.cjs'), 'utf8'), {
    require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { fixture = value } } }),
    process: { env: { REVIEW_FIXTURE_NOW: '2026-10-23 12:00:00.000' } }, setTimeout, Map, Date, console,
  })
  const { self, open } = await fixture.fetchDashboard()
  const change = JSON.parse(JSON.stringify(open[0]))
  change.subject = 'Simulated review: keep telemetry batches bounded'
  change.mergeable = true
  change.permitted_labels = { 'Code-Review': ['-1', '0', '+1'] }
  change.revisions.r1 = { _number: 1, created: change.created }
  change.revisions.r2 = { _number: 2, created: change.created }
  const state = { drafts: [], comments: [], reviewed: new Map(), calls: [], sequence: 0, draftTime: undefined, draftDelay: 0, failDraft: false, failDiscussion: false, failMetadata: false }
  const group = comments => Object.fromEntries([...new Set(comments.map(c => c.path))].map(file => [file, comments.filter(c => c.path === file)]))
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      const route = decodeURIComponent(url.pathname.replace(/^\/a/, ''))
      const body = JSON.parse(await new Promise(resolve => { let text = ''; req.on('data', part => { text += part }); req.on('end', () => resolve(text || '{}')) }))
      state.calls.push({ method: req.method, route, body })
      let result
      const ps = Number(route.match(/\/revisions\/(\d+)/)?.[1] || 3)
      if (route === '/accounts/self') result = self
      else if (route === '/accounts/self/capabilities') result = { administrateServer: true }
      else if (route.startsWith('/accounts/')) result = self
      else if (route === '/changes/') result = url.searchParams.getAll('q').map((_, index) => index === 0 ? [change] : [])
      else if (/\/detail$/.test(route)) { if (state.failMetadata) { res.writeHead(503).end('Simulated metadata failure'); return }; result = change }
      else if (/\/mergeable$/.test(route)) result = { mergeable: true }
      else if (/\/suggest_reviewers$/.test(route)) result = [{ account: self }]
      else if (/\/ported_(comments|drafts)$/.test(route)) result = {}
      else if (/\/drafts(?:\/[^/]+)?$/.test(route) && req.method !== 'GET') {
        if (state.draftDelay) await new Promise(resolve => setTimeout(resolve, state.draftDelay))
        if (state.failDraft) { res.writeHead(503).end('Simulated draft failure'); return }
        const draftId = route.match(/\/drafts\/([^/]+)$/)?.[1]
        if (req.method === 'DELETE') state.drafts = state.drafts.filter(c => c.id !== draftId)
        else {
          if (body.path === '/PATCHSET_LEVEL' && ['side', 'line', 'range', 'parent'].some(key => key in body)) {
            res.writeHead(400).end("patchset-level comments can't have side, range, or line"); return
          }
          const second = state.draftTime ?? new Date(Date.UTC(2026, 9, 23, 12) + ++state.sequence * 1000).toISOString().slice(0, 19).replace('T', ' ')
          const draft = { ...body, id: draftId || `draft-${++state.sequence}`, patch_set: ps, updated: second + '.123000000' }
          state.drafts = [...state.drafts.filter(c => c.id !== draft.id), { ...draft, updated: second + '.000000000' }]
          result = draft
        }
      } else if (/\/(comments|drafts)$/.test(route)) {
        if (state.failDiscussion) { res.writeHead(503).end('Simulated read failure'); return }
        result = group(route.endsWith('/drafts') ? state.drafts : state.comments)
      } else if (/\/comments\/[^/]+\/delete$/.test(route)) {
        const id = route.match(/\/comments\/([^/]+)\/delete$/)[1]
        const comment = state.comments.find(c => c.id === id)
        if (comment) comment.message = '(Comment removed)'
        result = comment || {}
      } else if (/\/review$/.test(route)) {
        const publishing = state.drafts.filter(c => body.drafts === 'PUBLISH_ALL_REVISIONS' || body.drafts === 'PUBLISH' && c.patch_set === ps)
        state.comments.push(...publishing.map(c => ({ ...c, author: self })))
        state.drafts = state.drafts.filter(c => !publishing.includes(c))
        for (const [label, value] of Object.entries(body.labels || {})) change.labels[label].all = [{ ...self, value }]
        change.updated = `2026-10-23 12:01:${String(++state.sequence).padStart(2, '0')}.000000000`
        result = {}
      } else if (/\/reviewed$/.test(route)) {
        const file = route.match(/\/files\/(.+)\/reviewed$/)[1]
        const reviewed = state.reviewed.get(ps) || new Set()
        if (req.method === 'PUT') reviewed.add(file); else reviewed.delete(file)
        state.reviewed.set(ps, reviewed)
      } else if (/\/files$/.test(route)) result = url.searchParams.has('reviewed')
        ? [...(state.reviewed.get(ps) || [])]
        : { 'src/telemetry/batch-scheduler.ts': { lines_inserted: 3, lines_deleted: 2 }, 'src/telemetry/types.ts': { lines_inserted: 1 } }
      else if (/\/diff$/.test(route)) {
        const file = route.match(/\/files\/(.+)\/diff$/)[1]
        result = { meta_a: { name: file }, meta_b: { name: file }, content: [
          { ab: [`// Simulated Gerrit data. Patch set ${ps}, base ${url.searchParams.get('base') || 'base'}.`, '', 'export class BatchScheduler {', '  enqueue(event: Event): void {', '    this.pending.push(event);'] },
          { a: ['    if (this.pending.length > this.options.maxBatchSize) {'], b: ['    if (this.pending.length >= this.options.maxBatchSize) {'] },
          { ab: ['      void this.flush();', '    }', '  }', '', '  async flush(): Promise<void> {'] },
          { a: ['    const batch = this.pending;'], b: ['    const batch = this.pending.splice(0, this.options.maxBatchSize);'] },
          { ab: ['    await this.transport.send(batch);', '  }', '}'] },
        ] }
      } else if (/\/fix:apply$|\/fixes\/.+\/apply$|\/reviewers\//.test(route)) result = {}
      else { res.writeHead(404).end('No simulated response for ' + route); return }
      if (result === undefined) res.writeHead(204).end()
      else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    } catch (error) { res.writeHead(500).end(String(error)) }
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  return { server, state, url: `http://127.0.0.1:${server.address().port}` }
}
module.exports = { startReviewServer }
