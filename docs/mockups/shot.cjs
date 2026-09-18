// Render an HTML mockup, or a web page, to PNG with Electron (no display needed under xvfb-run):
//   xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs in.html out.png [width]
//   SHOT_LOGIN=http://localhost:8080/login/%23%2F?account_id=1000001 xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs http://localhost:8080/c/demo/+/3 out.png
// SHOT_LOGIN is loaded first, for a page that needs a session (a Gerrit in DEVELOPMENT_BECOME_ANY_ACCOUNT mode).
// SHOT_DELAY (ms) waits before the capture, for a page that draws after load.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const [file, out, width = '1180'] = process.argv.slice(process.argv.findIndex((a) => a.endsWith('shot.cjs')) + 1)
app.disableHardwareAcceleration()
setTimeout(() => { console.error('shot: timed out'); process.exit(2) }, 30000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: Number(width), height: 900, show: true, frame: false, webPreferences: { sandbox: false } })
  console.error('shot: loading', file)
  if (process.env.SHOT_LOGIN) await win.loadURL(process.env.SHOT_LOGIN)
  if (/^https?:/.test(file)) await win.loadURL(file)
  else await win.loadFile(path.resolve(file))
  console.error('shot: loaded')
  await new Promise((r) => setTimeout(r, Number(process.env.SHOT_DELAY ?? 0)))
  const h = await win.webContents.executeJavaScript('Math.ceil((document.querySelector(".mock-note") || document.body).getBoundingClientRect().bottom) + 16')
  console.error('shot: height', h)
  win.setContentSize(Number(width), Math.min(h + 1, 4000))
  await new Promise((r) => setTimeout(r, 600))
  const img = await win.webContents.capturePage()
  fs.writeFileSync(out, img.toPNG())
  console.error('shot: wrote', out)
  process.exit(0)
})
