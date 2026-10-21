// Focused companion to review-comments-ui.cjs. Build first.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync('/tmp/review-selection-'))
app.disableHardwareAcceleration()
process.env.REVIEW_PORTED_FIXTURE = '1'
const timeout = setTimeout(() => app.exit(2), 120000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width:1600, height:1000, webPreferences:{contextIsolation:true,sandbox:false,preload:path.join(__dirname,'fixtures/local-review-preload.cjs')} })
  await win.loadFile(path.join(__dirname,'../out/renderer/index.html'))
  await win.webContents.executeJavaScript(`new Promise(resolve=>{const t=setInterval(()=>{const n=document.querySelector('.review-main');if(n){clearInterval(t);n.click();resolve()}},50)})`)
  await win.webContents.executeJavaScript(`new Promise(resolve=>{const t=setInterval(()=>{if(document.querySelector('.review-editor')?.dataset.reviewReady==='true'){clearInterval(t);resolve()}},50)})`)
  await require('./review-selection-checks.cjs')(win)
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
