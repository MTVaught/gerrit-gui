// Isolated child-process helpers. No settings/service handlers are replaced.
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const identity = { serverUrl: 'http://127.0.0.1:19786', username: 'dummy' }
export const legacy = { ...identity, password: 'dummy-startup-password', passwordEncrypted: false, passwordStorageVersion: 0, passwordIdentity: identity, theme: 'system' }
export const audit = async file => (await fs.readFile(file, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
export async function unusedPort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
export async function startBrowser(file, extra = {}, web = false) {
  const port = Number(extra.API_PORT ?? await unusedPort())
  const webPort = Number(extra.WEB_PORT ?? port)
  const origin = `http://localhost:${webPort}`
  const auditFile = file + '.audit'
  await fs.writeFile(auditFile, '')
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port), API_PORT: String(port), WEB_PORT: String(webPort), WEB_ORIGIN: origin,
    GERRIT_GUI_WEB_SETTINGS: file, GERRIT_SECRET_STARTUP_AUDIT: auditFile, GERRIT_URL: '', GERRIT_USER: '', GERRIT_PASSWORD: '', GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP: '1',
    NODE_OPTIONS: `--import=${new URL('./secret-startup-audit.mjs', import.meta.url).href}`, ...extra }
  const child = spawn(process.execPath, [web ? 'scripts/web.mjs' : '--no-warnings', ...(web ? [] : ['src/server/index.ts'])], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const startedAt = Date.now()
  let output = '', launchUrl
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    return exited
  }
  async function ready() {
    const end = Date.now() + 15000
    while (Date.now() < end) {
      launchUrl = output.match(/http:\/\/localhost:\d+\/#browser-key=[a-f0-9]{64}/)?.[0]
      if (launchUrl) return { at: Date.now(), events: await audit(auditFile) }
      if (child.exitCode !== null || child.signalCode !== null) throw Error(output.replace(/[a-f0-9]{64}/g, '[redacted]'))
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw Error('No API readiness: ' + output.replace(/[a-f0-9]{64}/g, '[redacted]'))
  }
  let cookie = ''
  const call = (method, args = []) => new Promise((resolve, reject) => {
    const body = JSON.stringify(method === 'session' ? [new URL(launchUrl).hash.split('=')[1]] : args)
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/' + method, method: 'POST', headers: { Host: new URL(origin).host, Origin: origin, 'Content-Type': 'application/json', Cookie: cookie } }, response => {
      let text = ''
      response.on('data', data => { text += data })
      response.on('end', () => { if (response.headers['set-cookie']) cookie = response.headers['set-cookie'][0].split(';')[0]; resolve({ status: response.statusCode, body: JSON.parse(text) }) })
    })
    req.on('error', reject); req.end(body)
  })
  return { child, stop, ready, exited, startedAt, auditFile, call, get launchUrl() { return launchUrl }, get output() { return output } }
}
