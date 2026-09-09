// Manual check of TLS trust from inside Electron's network stack.
// Usage: pnpm exec electron scripts/net-check.cjs https://your-gerrit/gerrit1
const { app, net } = require('electron')
app.whenReady().then(async () => {
  const given = process.argv.slice(1).filter((a) => /^https?:/.test(a))
  const targets = given.length ? given : ['https://api.github.com/', 'https://self-signed.badssl.com/']
  for (const url of targets) {
    try {
      const res = await net.fetch(url, { method: 'GET' })
      console.log('OK  ', url, res.status)
    } catch (e) {
      console.log('FAIL', url, e.message)
    }
  }
  app.quit()
})
