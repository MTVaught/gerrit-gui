import http from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { Service } from '../main/service.ts'

const MAX_BODY_BYTES = 1024 * 1024

/** One explicit browser origin. Never derive trust from request or proxy headers. */
export function browserOrigin(value: string): URL {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('WEB_ORIGIN must be one HTTP or HTTPS origin without a path, query, or fragment')
  }
  return url
}

class RequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

function equalSecret(value: string, secret: string): boolean {
  const bytes = Buffer.from(value)
  const expected = Buffer.from(secret)
  return bytes.length === expected.length && timingSafeEqual(bytes, expected)
}

function readArguments(req: http.IncomingMessage): Promise<unknown[]> {
  const types = req.rawHeaders.filter((value, i) => i % 2 === 0 && value.toLowerCase() === 'content-type')
  if (types.length !== 1 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) {
    throw new RequestError(415, 'Use application/json')
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    throw new RequestError(415, 'Content encoding is not supported')
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0
        reject(new RequestError(413, 'JSON body exceeds 1 MiB'))
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return
      try {
        const args: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
        if (!Array.isArray(args)) throw new Error('Expected an array')
        resolve(args)
      } catch {
        reject(new RequestError(400, 'Send a JSON array of arguments'))
      }
    })
    req.on('error', reject)
    req.on('aborted', () => reject(new RequestError(400, 'Request aborted')))
  })
}

export function createBrowserServer(service: Service, originValue: string) {
  const origin = browserOrigin(originValue)
  const bootstrapKey = randomBytes(32).toString('hex')
  const session = randomBytes(32).toString('hex')
  const cookieName = `gerrit_session_${randomBytes(8).toString('hex')}`
  let bootstrapped = false

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const send = (status: number, value: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
    }
    try {
      // Check duplicates too: Node normally keeps only the first Host value.
      const count = (name: string) => req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i]!.toLowerCase() === name).length
      if (count('host') !== 1 || req.headers.host !== origin.host) {
        throw new RequestError(403, 'Host is not allowed')
      }
      if (count('origin') !== 1 || req.headers.origin !== origin.origin ||
          (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
        throw new RequestError(403, 'Origin is not allowed')
      }
      if (req.method !== 'POST') throw new RequestError(405, 'Use POST')

      const cookies = (req.headers.cookie ?? '').split(';').map(part => part.trim().split('='))
      const matches = cookies.filter(([name]) => name === cookieName)
      const authenticated = bootstrapped && matches.length === 1 && equalSecret(matches[0]?.[1] ?? '', session)
      if (req.url === '/api/session') {
        const args = await readArguments(req)
        if (!authenticated && (bootstrapped || args.length !== 1 || typeof args[0] !== 'string' || !equalSecret(args[0], bootstrapKey))) {
          throw new RequestError(401, 'Open the one-use browser link printed by pnpm web. Restart pnpm web to get a new link.')
        }
        bootstrapped = true
        res.setHeader('Set-Cookie', `${cookieName}=${session}; Path=/api/; HttpOnly; SameSite=Strict${origin.protocol === 'https:' ? '; Secure' : ''}`)
        send(200, null)
        return
      }
      if (!authenticated) throw new RequestError(401, 'Open the one-use browser link printed by pnpm web. Restart pnpm web to get a new link.')
      const method = /^\/api\/([a-zA-Z]+)$/.exec(req.url ?? '')?.[1] as keyof Service | undefined
      if (!method || !Object.hasOwn(service, method) || typeof service[method] !== 'function') {
        throw new RequestError(404, 'Not found')
      }
      const args = await readArguments(req)
      const result = await (service[method] as (...args: unknown[]) => Promise<unknown>)(...args)
      send(200, result ?? null)
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500
      send(status, { error: (error as Error).message })
      req.resume()
    }
  })
  server.requestTimeout = 10_000
  server.headersTimeout = 10_000
  return { server, launchUrl: `${origin.origin}/#browser-key=${bootstrapKey}` }
}
