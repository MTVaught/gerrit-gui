// Browser mode API: the same Service the Electron preload exposes, served over
// plain HTTP on 127.0.0.1 so the React UI can run in a browser (Vite dev server
// proxies /api here). Intended for development, e.g. over VS Code port
// forwarding; it never binds to a non-loopback address.
//
//   node src/server/index.ts            (Node 22.6+ strips types natively)
//   PORT=5174 by default
import { createService } from '../main/service.ts'
import { fileSettings } from './file-settings.ts'
import { createBrowserServer } from './browser-server.ts'

const port = Number(process.env['PORT'] ?? 5174)
const service = createService(fileSettings(process.env['GERRIT_GUI_WEB_SETTINGS']), (url, init) => fetch(url, init))
const origin = process.env['WEB_ORIGIN'] ?? `http://localhost:${process.env['WEB_PORT'] ?? 5173}`
const { server, launchUrl } = createBrowserServer(service, origin)

server.listen(port, '127.0.0.1', () => {
  console.log(`Open this one-use browser link after Vite is ready:\n${launchUrl}`)
})
