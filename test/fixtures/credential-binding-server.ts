// Isolated browser API with the production store/service and a dummy Gerrit.
// No request reaches a real Gerrit server and no user settings are read.
import http from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createService } from '../../src/main/service.ts'
import { fileSettings } from '../../src/server/file-settings.ts'

for (const key of ['GERRIT_URL', 'GERRIT_USER', 'GERRIT_PASSWORD']) delete process.env[key]
const directory = await mkdtemp(path.join(os.tmpdir(), 'gerrit-credential-ui-'))
const file = path.join(directory, 'settings.json')
const root = fileURLToPath(new URL('../../out/renderer/', import.meta.url))
const sent: { origin: string; authorization: string }[] = []
let saves = 0
const store = fileSettings(file)
const service = createService({
  ...store,
  async save(input) { await store.save(input); saves++ },
}, async (url, init) => {
  sent.push({ origin: new URL(url).origin, authorization: new Headers(init.headers).get('Authorization')! })
  return new Response(JSON.stringify({ _account_id: 2, username: 'bob', name: 'Dummy Bob', email: 'bob@example.test' }))
})
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/fixture/reset') {
      await writeFile(file, JSON.stringify({ theme: 'system', serverUrl: 'https://old.example/gerrit', username: 'alice', password: 'dummy-old-secret' }))
      sent.length = 0
      saves = 0
      res.end('{}')
    } else if (req.url === '/fixture/stats') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ sent, saves, credentials: await store.getCredentials() }))
    } else if (req.url?.startsWith('/api/')) {
      let body = ''
      for await (const chunk of req) body += chunk
      const args = JSON.parse(body || '[]')
      let result: unknown
      switch (req.url) {
        case '/api/getSettings': result = await service.getSettings(); break
        case '/api/saveSettings': result = await service.saveSettings(args[0]); break
        case '/api/testConnection': result = await service.testConnection(); break
        default: throw new Error('Unexpected fixture API request: ' + req.url)
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result ?? null))
    } else {
      const target = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url!.split('?')[0]))
      if (!target.startsWith(root)) throw new Error('Invalid fixture asset path')
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
      res.setHeader('Content-Type', mime[path.extname(target)] ?? 'application/octet-stream')
      res.end(await readFile(target))
    }
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (error as Error).message }))
  }
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
console.log(JSON.stringify({ port: (server.address() as import('node:net').AddressInfo).port }))
process.on('SIGTERM', () => { server.close(); void rm(directory, { recursive: true, force: true }).then(() => process.exit()) })
