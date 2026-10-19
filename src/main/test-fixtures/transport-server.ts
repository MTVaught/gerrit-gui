// Local wire-level fixture. Uses only dummy credentials and a temporary CA.
import http from 'node:http'
import https from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

export async function transportServer() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gerrit-transport-tls-'))
  const certFile = path.join(dir, 'cert.pem')
  const keyFile = path.join(dir, 'key.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', keyFile, '-out', certFile, '-subj', '/CN=Gerrit transport test',
    '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' })
  const cert = await readFile(certFile, 'utf8')
  const httpRequests: string[] = []
  const tlsRequests: { path: string; authorization?: string }[] = []
  const plain = http.createServer((req, res) => {
    httpRequests.push(req.url ?? '')
    res.writeHead(200).end('{}')
  })
  plain.listen(0, '127.0.0.1')
  await once(plain, 'listening')
  const httpUrl = `http://127.0.0.1:${(plain.address() as AddressInfo).port}`
  const secure = https.createServer({ cert, key: await readFile(keyFile) }, (req, res) => {
    tlsRequests.push({ path: req.url ?? '', authorization: req.headers.authorization })
    const redirect = /^\/redirect-(301|302|303|307|308)\//.exec(req.url ?? '')
    if (redirect) {
      res.writeHead(Number(redirect[1]), { Location: httpUrl + '/credential-leak' }).end()
      return
    }
    if (req.url !== '/gerrit/a/accounts/self') { res.writeHead(404).end(); return }
    if (req.headers.authorization !== 'Basic ' + Buffer.from('dummy:dummy').toString('base64')) {
      res.writeHead(401).end(); return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(")]}'\n" + JSON.stringify({ _account_id: 1, username: 'dummy', name: 'Transport test', email: 'dummy@example.invalid' }))
  })
  secure.listen(0, '127.0.0.1')
  await once(secure, 'listening')
  const httpsUrl = `https://127.0.0.1:${(secure.address() as AddressInfo).port}`
  return {
    certFile, cert, httpUrl, httpsUrl, httpRequests, tlsRequests,
    async close() {
      await Promise.all([new Promise<void>(resolve => plain.close(() => resolve())), new Promise<void>(resolve => secure.close(() => resolve()))])
      await rm(dir, { recursive: true, force: true })
    },
  }
}
