// Import the same ESM paths that the application uses through Monaco hover.
import purify from 'monaco-editor/base/browser/dompurify/dompurify'
import { sanitizeHtml } from 'monaco-editor/base/browser/domSanitize'
import audit from '../../docs/security-dependencies/audit-after.json'
import productionAudit from '../../docs/security-dependencies/audit-production.json'
import artifacts from '../../docs/security-dependencies/artifacts.json'

document.querySelector('#version').textContent = `Monaco ESM sanitizer: DOMPurify ${purify.version}`
const counts = audit.metadata.vulnerabilities
document.querySelector('#audit').textContent = `Full audit: ${counts.high} high, ${counts.moderate} moderate, ${counts.low} low. Remaining: optional build logger sprintf-js. Production audit: ${Object.values(productionAudit.metadata.vulnerabilities).reduce((sum, count) => sum + count, 0)} findings.`
document.querySelector('#package').textContent = `Verified Linux app.asar ${artifacts.archive.sha256.slice(0, 12)}: fixed sanitizer present; unused Monaco distributions and build logger absent.`
document.querySelector('#run').addEventListener('click', async () => {
  window.securityPayloads = 0
  const checks = []
  const html = String(sanitizeHtml('<h3>Safe review text</h3><a href="javascript:window.securityPayloads++" onclick="window.securityPayloads++">Review link</a>'))
  const rendered = document.querySelector('#rendered')
  rendered.innerHTML = html
  document.querySelector('#serialized').textContent = html
  checks.push({ name: 'Monaco HTML', passed: !rendered.querySelector('[onclick], [href]') && rendered.querySelector('h3')?.textContent === 'Safe review text' })

  // GHSA-p98j-92pf-mc4p: retain a reference to a hook-detached subtree.
  for (const hook of ['afterSanitizeElements', 'afterSanitizeAttributes']) {
    const root = document.createElement('div')
    root.innerHTML = '<section id="remove"><img src="data:image/png;base64,AA==" onerror="window.securityPayloads++"></section>'
    const removed = root.firstChild
    const image = removed.firstChild
    document.querySelector('#hook-probe').append(root)
    purify.addHook(hook, node => { if (node === removed) node.remove() })
    try {
      purify.sanitize(root, { IN_PLACE: true })
      checks.push({ name: hook, passed: !removed.parentNode && !image.hasAttribute('onerror') })
    } finally {
      purify.removeAllHooks()
      root.remove()
    }
  }
  const hookChecks = checks.slice(1)
  document.querySelector('#hooks').textContent = hookChecks.map(check => `${check.name}: ${check.passed ? 'removed image has no event handler' : 'UNSAFE event handler retained'}`).join('. ')

  // GHSA-6688-9rhm-gjv2: reject a removed rawtext root before HTML reparse.
  const style = document.createElement('style')
  style.textContent = '</style><img src=x onerror="window.securityPayloads++">'
  document.body.append(style)
  let rejected = false
  try { purify.sanitize(style, { IN_PLACE: true }) } catch (error) { rejected = error instanceof TypeError }
  finally { style.remove() }
  checks.push({ name: 'rawtext root rejected', passed: rejected })
  document.querySelector('#rawtext').textContent = rejected ? 'Unsafe style root rejected with TypeError. No HTML returned for reparse.' : 'UNSAFE raw text root returned.'
  await new Promise(resolve => setTimeout(resolve, 300))
  checks.push({ name: 'no payload execution', passed: window.securityPayloads === 0 })
  document.querySelector('#executions').textContent = `Payload executions: ${window.securityPayloads}`
  document.querySelector('#status').textContent = checks.every(check => check.passed) ? 'All sanitizer probes passed' : 'Sanitizer probe failed'
  document.querySelector('#status').className = 'result'
  window.securityResult = { version: purify.version, html, checks, payloadExecutions: window.securityPayloads }
})
