// Test-only observation and optional failure injection; never part of production releases.
import http from 'node:http'
import fs from 'node:fs'
if (process.argv[1]?.replaceAll('\\', '/')?.endsWith('src/server/index.ts') && process.env.GERRIT_SECRET_STARTUP_AUDIT) {
  if (process.env.GERRIT_SECRET_TEST_RENAME_DENIED === '1') {
    // Portable failure injection for a disposable child process, including Windows.
    const rename = fs.promises.rename
    fs.promises.rename = async function (from, to) {
      if (to === process.env.GERRIT_GUI_WEB_SETTINGS) {
        throw Object.assign(new Error('Dummy settings replacement denied'), { code: 'EACCES' })
      }
      return rename.call(this, from, to)
    }
  }
  const record = value => fs.appendFileSync(process.env.GERRIT_SECRET_STARTUP_AUDIT, JSON.stringify({ at: Date.now(), ...value }) + '\n')
  const listen = http.Server.prototype.listen
  http.Server.prototype.listen = function (...args) {
    const file = process.env.GERRIT_GUI_WEB_SETTINGS
    record({ event: 'before-listen', snapshot: JSON.parse(fs.readFileSync(file, 'utf8')), mode: (fs.statSync(file).mode & 0o777).toString(8) })
    return listen.apply(this, args)
  }
  const emit = http.Server.prototype.emit
  http.Server.prototype.emit = function (event, ...args) {
    if (event === 'request') record({ event: 'request', method: args[0].method, path: args[0].url })
    return emit.call(this, event, ...args)
  }
}
