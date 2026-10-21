const { app, BrowserWindow, nativeTheme } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const root = process.argv.at(-1)
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-background-networking')
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const captures = []
  for (const mode of ['light', 'dark']) {
    nativeTheme.themeSource = mode
    const win = new BrowserWindow({ width: 728, height: 900, useContentSize: true, show: false, backgroundColor: mode === 'light' ? '#ffffff' : '#181a1e', webPreferences: { contextIsolation: true, sandbox: true } })
    await win.loadFile(path.join(root, 'proposal.html'))
    await win.webContents.executeJavaScript('document.fonts.ready')
    const height = await win.webContents.executeJavaScript('Math.ceil(document.body.getBoundingClientRect().height)')
    win.setContentSize(728, height)
    await new Promise(resolve => setTimeout(resolve, 200))
    const result = await win.webContents.executeJavaScript(`(() => {
      const fields = [...document.querySelectorAll('textarea')];
      return { width: innerWidth, height: innerHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, fields: fields.map(el => ({ top: el.getBoundingClientRect().top, height: el.clientHeight, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, text: el.value })), codePositions: [...document.querySelectorAll('.code.add')].map(el => el.getBoundingClientRect().top) };
    })()`)
    if (result.horizontalOverflow || result.fields[0].scrollTop !== 0 || result.fields[1].scrollTop !== 120 || result.codePositions[0] !== result.codePositions[1]) throw new Error('Invalid mockup geometry: ' + JSON.stringify(result))
    const file = path.join(root, 'proposal-' + mode + '.png')
    fs.writeFileSync(file, (await win.webContents.capturePage()).toPNG())
    captures.push({ mode, file, ...result })
    win.destroy()
  }
  fs.writeFileSync(path.join(root, 'capture-results.json'), JSON.stringify({ platform: process.platform, electron: process.versions.electron, type: 'Static mockup with simulated data; not application behavior', captures }, null, 2) + '\n')
  console.log(JSON.stringify(captures.map(({ fields, ...capture }) => ({ ...capture, fields: fields.map(({ text, ...field }) => field) }))))
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
