// Browser mode: run the local API server and the Vite renderer dev server
// together, no Electron and no display needed. Open http://localhost:5173/
// (VS Code forwards the port automatically over Remote SSH).
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const opts = { cwd: root, stdio: 'inherit', env: { ...process.env, API_PORT: process.env.API_PORT ?? '5174' } }
const api = spawn(process.execPath, ['--no-warnings', 'src/server/index.ts'], { ...opts, env: { ...opts.env, PORT: opts.env.API_PORT } })
const vite = spawn(path.join(root, 'node_modules', '.bin', 'vite'), ['--config', 'vite.web.config.ts'], opts)

const stop = () => {
  api.kill()
  vite.kill()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
api.on('exit', (code) => {
  vite.kill()
  process.exit(code ?? 0)
})
vite.on('exit', (code) => {
  api.kill()
  process.exit(code ?? 0)
})
