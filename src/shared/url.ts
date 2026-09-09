/**
 * Turn anything a user might paste (a change URL, a dashboard URL, the base
 * with a trailing slash or /a suffix) into the Gerrit base URL, including any
 * path prefix such as /gerrit1 that the server is mounted under.
 */
export function normalizeServerUrl(input: string): string {
  let s = input.trim()
  if (s === '') return ''
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  s = s.replace(/#.*$/, '').replace(/\?.*$/, '')
  // Strip PolyGerrit UI routes and the REST prefix; what remains is the base.
  s = s.replace(/\/(c|q|admin|settings|dashboard|x|login|logout|plugins|Documentation|changes|projects|accounts|config)(\/.*)?$/, '')
  s = s.replace(/\/a$/, '')
  return s.replace(/\/+$/, '')
}
