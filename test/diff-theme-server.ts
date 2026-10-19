// Browser fixture: real renderer and browser settings store, simulated Gerrit data.
import http from 'node:http'
import vm from 'node:vm'
import { readFileSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileSettings } from '../src/server/file-settings.ts'

const scratch = mkdtempSync(path.join(os.tmpdir(), 'diff-theme-browser-'))
let fixture: Record<string, (...args: any[]) => Promise<any>> = {}
vm.runInNewContext(readFileSync(new URL('./fixtures/local-review-preload.cjs', import.meta.url), 'utf8'), {
  require: () => ({ contextBridge: { exposeInMainWorld: (_name: string, value: typeof fixture) => { fixture = value } } }),
  process: { env: { REVIEW_FILE_ACTIVITY_FIXTURE: '1', REVIEW_FIXTURE_NOW: '2026-10-19 12:00:00.000' } },
  setTimeout, Map, Date, console,
})
const store = fileSettings(path.join(scratch, 'settings.json'))
await store.save({ ...await fixture.getSettings!(), theme: 'system', diffTheme: 'application', password: 'fixture' })
fixture.getSettings = () => store.getStatus()
fixture.saveSettings = input => store.save(input)
const server = http.createServer(async (req, res) => {
  try {
    const method = req.url?.match(/^\/api\/([a-zA-Z]+)$/)?.[1]
    if (req.method !== 'POST' || !method || !fixture[method]) { res.writeHead(404).end(); return }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const result = await fixture[method]!(...JSON.parse(Buffer.concat(chunks).toString() || '[]'))
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result ?? null))
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (error as Error).message }))
  }
})
server.listen(Number(process.env.PORT ?? 5184), '127.0.0.1', () => console.log('Diff theme browser fixture ready'))
