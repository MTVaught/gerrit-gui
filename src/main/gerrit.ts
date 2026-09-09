import type { AccountInfo, ChangeInfo, ChangeLink, SuggestedReviewerInfo } from '../shared/types.ts'
import { changePath } from '../shared/url.ts'

const XSSI_PREFIX = ")]}'"

export class GerritError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/**
 * Minimal Gerrit REST client using HTTP-password basic auth on /a/ endpoints.
 *
 * Takes a fetch implementation so the Electron app can pass `net.fetch`
 * (Chromium's stack: OS certificate store, system proxy) while tests use
 * Node's global fetch.
 */
export class GerritClient {
  private readonly base: string
  private readonly auth: string
  private readonly fetchImpl: FetchLike

  constructor(serverUrl: string, username: string, password: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
    this.base = serverUrl.replace(/\/+$/, '')
    this.auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    this.fetchImpl = fetchImpl
  }

  private async req<T>(method: string, path: string, body?: unknown, query?: URLSearchParams): Promise<T> {
    const url = `${this.base}/a${path}${query ? '?' + query.toString() : ''}`
    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: this.auth,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      // Node's fetch hides the useful part (DNS, TLS, refused) in `cause`;
      // Electron's net.fetch puts a net::ERR_* code in the message itself.
      const cause = (e as { cause?: { code?: string; message?: string } }).cause
      const detail = [cause?.code, cause?.message ?? (e as Error).message].filter(Boolean).join(' ')
      throw new GerritError(`Cannot reach ${url}: ${detail}`, 0)
    }
    const text = await res.text()
    if (!res.ok) {
      throw new GerritError(`${method} ${path}: ${res.status} ${text.trim() || res.statusText}`, res.status)
    }
    if (res.status === 204 || text.length === 0) return undefined as T
    const json = text.startsWith(XSSI_PREFIX) ? text.slice(XSSI_PREFIX.length) : text
    return JSON.parse(json) as T
  }

  self(): Promise<AccountInfo> {
    return this.req('GET', '/accounts/self')
  }

  /** Runs several searches in one request; returns one array per query. */
  async queryChanges(queries: string[], limit = 300): Promise<ChangeInfo[][]> {
    const q = new URLSearchParams()
    for (const s of queries) q.append('q', s)
    q.set('n', String(limit))
    for (const o of ['DETAILED_LABELS', 'DETAILED_ACCOUNTS', 'CURRENT_REVISION', 'SUBMITTABLE', 'SUBMIT_REQUIREMENTS', 'CURRENT_ACTIONS', 'CUSTOM_KEYED_VALUES', 'MESSAGES']) {
      q.append('o', o)
    }
    const result = await this.req<ChangeInfo[] | ChangeInfo[][]>('GET', '/changes/', undefined, q)
    // Gerrit returns a flat array for a single q= and an array of arrays for several.
    return queries.length === 1 ? [result as ChangeInfo[]] : (result as ChangeInfo[][])
  }

  setReady(id: number) {
    return this.req<void>('POST', `/changes/${id}/ready`, {})
  }

  setWip(id: number) {
    return this.req<void>('POST', `/changes/${id}/wip`, {})
  }

  vote(id: number, label: string, value: number, message?: string) {
    return this.req<unknown>('POST', `/changes/${id}/revisions/current/review`, {
      labels: { [label]: value },
      message: message || undefined,
    })
  }

  setHashtags(id: number, add: string[] = [], remove: string[] = []) {
    return this.req<string[]>('POST', `/changes/${id}/hashtags`, { add, remove })
  }

  /** Change-level key/value metadata. Writable by the change owner and admins. */
  setCustomKeyedValues(id: number, add: Record<string, string> = {}, remove: string[] = []) {
    return this.req<Record<string, string>>('POST', `/changes/${id}/custom_keyed_values`, { add, remove })
  }

  submit(id: number) {
    return this.req<ChangeInfo>('POST', `/changes/${id}/submit`, {})
  }

  addReviewer(id: number, reviewer: string) {
    return this.req<unknown>('POST', `/changes/${id}/reviewers`, { reviewer })
  }

  removeReviewer(id: number, accountId: number) {
    return this.req<void>('POST', `/changes/${id}/reviewers/${accountId}/delete`, {})
  }

  suggestReviewers(id: number, q: string): Promise<SuggestedReviewerInfo[]> {
    const params = new URLSearchParams({ q, n: '8', 'reviewer-state': 'REVIEWER' })
    return this.req('GET', `/changes/${id}/suggest_reviewers`, undefined, params)
  }

  changeUrl(link: ChangeLink): string {
    return this.base + changePath(link)
  }
}
