// Browser mode API: the same Service the Electron preload exposes, served over
// plain HTTP on 127.0.0.1 so the React UI can run in a browser (Vite dev server
// proxies /api here). Intended for development, e.g. over VS Code port
// forwarding; it never binds to a non-loopback address.
//
//   node src/server/index.ts            (Node 22.6+ strips types natively)
//   PORT=5174 by default
import http from 'node:http'
import { createService, type Service } from '../main/service.ts'
import { fileSettings } from './file-settings.ts'

const port = Number(process.env['PORT'] ?? 5174)
const service = createService(fileSettings(), (url, init) => fetch(url, init))

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c: Buffer) => (data += c.toString()))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const m = /^\/api\/([a-zA-Z]+)$/.exec(req.url ?? '')
  const method = m?.[1] as keyof Service | undefined
  if (req.method !== 'POST' || !method || typeof service[method] !== 'function') {
    res.writeHead(404).end('not found')
    return
  }
  try {
    const args = JSON.parse((await readBody(req)) || '[]') as unknown[]
    const result = await (service[method] as (...a: unknown[]) => Promise<unknown>)(...args)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result ?? null))
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`gerrit-gui API for browser mode on http://127.0.0.1:${port}/api/*`)
})
