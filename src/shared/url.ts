import type { ChangeLink } from './types.ts'

/** HTTP is only for an explicitly enabled test server on a loopback IP. */
export function validateServerUrl(input: string, allowLocalTestHttp = false): URL {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('Enter a valid HTTPS Gerrit server URL.')
  }
  const localTest = allowLocalTestHttp && url.protocol === 'http:'
    && (url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  if (url.protocol !== 'https:' && !localTest) {
    throw new Error('Gerrit requires HTTPS. Change the server URL to https://. HTTP is only allowed for explicit local tests on a loopback IP.')
  }
  if (url.username || url.password) throw new Error('Enter Gerrit credentials in the username and password fields, not in the server URL.')
  return url
}

/**
 * Turn anything a user might paste (a change URL, a dashboard URL, the base
 * with a trailing slash or /a suffix) into the Gerrit base URL, including any
 * path prefix such as /gerrit1 that the server is mounted under.
 */
export function normalizeServerUrl(input: string, allowLocalTestHttp = false): string {
  let s = input.trim()
  if (s === '') return ''
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(s)) s = 'https://' + s
  s = validateServerUrl(s, allowLocalTestHttp).href
  s = s.replace(/#.*$/, '').replace(/\?.*$/, '')
  // Strip PolyGerrit UI routes and the REST prefix; what remains is the base.
  s = s.replace(/\/(c|q|admin|settings|dashboard|x|login|logout|plugins|Documentation|changes|projects|accounts|config)(\/.*)?$/, '')
  s = s.replace(/\/a$/, '')
  return s.replace(/\/+$/, '')
}

/**
 * PolyGerrit path for a change: the change page, one patch set's diff against
 * base, or the diff between two patch sets ("/3..5"). The project is part of
 * the path so Gerrit does not need a redirect to find it.
 */
export function changePath(link: ChangeLink): string {
  let p = `/c/${encodeURIComponent(link.project)}/+/${link.id}`
  if (link.patchSet !== undefined) {
    p += link.basePatchSet !== undefined ? `/${link.basePatchSet}..${link.patchSet}` : `/${link.patchSet}`
  }
  return p
}
