// The real built desktop entrypoint, isolated settings, fixed framing, and read-only inspection.
const { app, nativeTheme, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
app.disableHardwareAcceleration()
app.setPath('userData', process.env.GERRIT_GUI_USER_DATA)
nativeTheme.themeSource = process.env.NATIVE_REVIEW_THEME || 'light'
app.on('browser-window-created', (_event, win) => {
  win.once('ready-to-show', () => win.setBounds({ x: 50, y: 55, width: 1320, height: 820 }))
  // Observations for automation. Inputs are sent with xdotool, not this inspector.
  if (process.env.NATIVE_REVIEW_INSPECT) setInterval(async () => {
    if (win.isDestroyed()) return
    const value = await win.webContents.executeJavaScript(`({
      controls: Array.from(document.querySelectorAll('button,input,select')).filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height}).map(el=>({text:el.textContent.trim(),label:el.getAttribute('aria-label'),type:el.type,checked:el.checked,rect:el.getBoundingClientRect().toJSON()})),
      review: document.querySelector('#local-review-title')?.textContent,
      ready: document.querySelector('.review-editor')?.dataset.reviewReady,
      text: document.body.innerText,
      comparison: document.querySelector('[aria-label="Patch set"]')?.value
    })`).catch(() => null)
    fs.writeFileSync(process.env.NATIVE_REVIEW_INSPECT, JSON.stringify({ ...value, visible: win.isVisible(), bounds: win.getBounds(), windows: BrowserWindow.getAllWindows().length }))
  }, 250).unref()
})
require(path.join(__dirname, '../../out/main/index.js'))
