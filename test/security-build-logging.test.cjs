// Exercise the remaining optional build dependency with local, hostile log data.
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const http = require('node:http')
const https = require('node:https')
const { test } = require('node:test')

test('global-agent keeps external data out of sprintf format strings', async () => {
  const fromBuilder = createRequire(require.resolve('electron-builder/package.json'))
  const fromAppBuilder = createRequire(fromBuilder.resolve('app-builder-lib/package.json'))
  const fromGet = createRequire(fromAppBuilder.resolve('@electron/get/package.json'))
  const fromAgent = createRequire(fromGet.resolve('global-agent/package.json'))
  const fromRoarr = createRequire(fromAgent.resolve('roarr/package.json'))
  const sprintf = fromRoarr('sprintf-js')
  const originalSprintf = sprintf.sprintf
  const payload = '%.1000000f'
  assert.throws(() => originalSprintf(payload, 1), RangeError, 'the installed package still has the reported fault')
  const formats = []
  sprintf.sprintf = (format, ...args) => { formats.push(format); return originalSprintf(format, ...args) }
  const previousLog = process.env.ROARR_LOG
  process.env.ROARR_LOG = 'true'
  const roarr = fromAgent('roarr')
  const previousWrite = roarr.ROARR.write
  const messages = []
  roarr.ROARR.write = value => messages.push(JSON.parse(value))
  const originals = { get: http.get, request: http.request, httpAgent: http.globalAgent,
    httpsGet: https.get, httpsRequest: https.request, httpsAgent: https.globalAgent }
  const server = http.createServer((_request, response) => {
    response.setHeader('x-security-probe', payload)
    response.end('local proxy fixture')
  })
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const controller = fromGet('global-agent').createGlobalProxyAgent({ environmentVariableNamespace: 'SECURITY_DEP_TEST_', socketConnectionTimeout: 2000 })
    controller.HTTP_PROXY = `http://127.0.0.1:${server.address().port}`
    controller.HTTPS_PROXY = null
    controller.NO_PROXY = null
    await new Promise((resolve, reject) => {
      http.get(`http://dummy.invalid/${payload}`, response => {
        response.resume()
        response.on('end', resolve)
      }).on('error', reject)
    })
    assert.ok(messages.some(message => JSON.stringify(message.context).includes(payload)), 'hostile URL/header reached logger context')
    assert.ok(formats.includes('proxying request') && formats.includes('proxying response'))
    assert.ok(formats.every(format => !format.includes(payload)), 'hostile data never became a format string')
    console.log(JSON.stringify({ advisory: 'GHSA-hp3w-g68c-fv3c', directCallThrows: true, proxyRequest: 'completed', externalDataInContext: true, formatStrings: [...new Set(formats)] }))
  } finally {
    http.get = originals.get; http.request = originals.request; http.globalAgent = originals.httpAgent
    https.get = originals.httpsGet; https.request = originals.httpsRequest; https.globalAgent = originals.httpsAgent
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    sprintf.sprintf = originalSprintf
    roarr.ROARR.write = previousWrite
    if (previousLog === undefined) delete process.env.ROARR_LOG
    else process.env.ROARR_LOG = previousLog
  }
})
