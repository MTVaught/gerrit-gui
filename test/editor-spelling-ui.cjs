// Exercise Chromium's spelling context and replacement command in native editors.
const { app, BrowserWindow, Menu } = require('electron')
const { editorContextMenu } = require('../src/main/editor-context-menu.ts')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-spelling-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 45000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 700, height: 500, webPreferences: { sandbox: false, spellcheck: true, preload: path.join(__dirname, 'fixtures/spelling-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  await win.loadURL('data:text/html,' + encodeURIComponent('<textarea id="comment" spellcheck="true" oninput="this.dataset.inputValue=this.value" style="font:24px monospace;width:550px;height:120px;margin:20px">mispelled</textarea><input id="other" spellcheck="true" oninput="this.dataset.inputValue=this.value" style="font:24px monospace;margin:20px" value="mispelled">'))
  win.focus(); win.webContents.focus()
  let context = null
  win.webContents.on('context-menu', (_event, params) => { context = params })
  async function rightClick(id) {
    await run(`document.getElementById('${id}').focus()`)
    const rect = await run(`document.getElementById('${id}').getBoundingClientRect().toJSON()`)
    context = null
    win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(rect.x + 35), y: Math.round(rect.y + 15), button: 'right', clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(rect.x + 35), y: Math.round(rect.y + 15), button: 'right', clickCount: 1 })
    for (let i = 0; i < 100 && !context; i++) await delay(50)
    assert.ok(context?.isEditable, 'native context menu identifies the editor')
  }
  // The deterministic provider marks the real misspelling. Supply the suggestion
  // list independently of the OS dictionary, then exercise the native replacement.
  for (const id of ['comment', 'other']) {
    await run(`document.getElementById('${id}').focus()`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'a', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'a', modifiers: ['control'] });
    await win.webContents.insertText('mispelled ');
    await delay(500)
    await rightClick(id)
    assert.equal(context.misspelledWord, 'mispelled', 'Chromium detects the misspelling under the mouse')
    const template = editorContextMenu({ ...context, dictionarySuggestions: ['misspelled'] }, {
      replace: word => win.webContents.replaceMisspelling(word),
      addToDictionary: word => win.webContents.session.addWordToSpellCheckerDictionary(word),
    })
    const menu = Menu.buildFromTemplate(template)
    menu.items[0].click(menu.items[0], win, {})
    await delay(100)
    assert.equal(await run(`document.getElementById('${id}').value`), 'misspelled ', 'native correction replaces the word in ' + id)
    await run(`document.getElementById('${id}').focus()`)
    assert.equal(await run(`document.getElementById('${id}').dataset.inputValue`), 'misspelled ', 'correction dispatches input for controlled editors')
    win.webContents.undo(); await delay(100)
    assert.equal(await run(`document.getElementById('${id}').value`), 'mispelled ', 'correction can be undone')
  }
  console.log(JSON.stringify({ nativeCorrection: 'passed', textarea: 'passed', otherEditor: 'passed', undo: 'passed' }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
