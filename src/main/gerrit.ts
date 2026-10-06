import type { AccountInfo, ChangeInfo, ChangeLink, ReviewDiff, FileInfo, SuggestedReviewerInfo, ReviewComment, DraftCommentInput, SubmitReviewInput } from '../shared/types.ts'
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
 * What the board needs on every change: labels, accounts, the current
 * revision and its commit message, hashtags, keyed values and messages.
 * ALL_REVISIONS adds the SHA of every patch set, so a change built on an
 * older patch set of another is still linked to it.
 */
const CHANGE_OPTIONS = ['DETAILED_LABELS', 'DETAILED_ACCOUNTS', 'CURRENT_REVISION', 'CURRENT_COMMIT', 'ALL_REVISIONS', 'SUBMITTABLE', 'SUBMIT_REQUIREMENTS', 'CURRENT_ACTIONS', 'CUSTOM_KEYED_VALUES', 'MESSAGES']

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
  /**
   * Set, the client answers `self()` with this account and refuses every
   * request that is not a GET, so the board can be looked at as that person
   * sees it without anything being written in their name or the user's own.
   * The requests still go out with the user's credentials: what the server
   * lets the user see or do (private changes, +2 rights) is unchanged.
   */
  pretendAs: AccountInfo | null = null

  constructor(serverUrl: string, username: string, password: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)) {
    this.base = serverUrl.replace(/\/+$/, '')
    this.auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
    this.fetchImpl = fetchImpl
  }

  private async req<T>(method: string, path: string, body?: unknown, query?: URLSearchParams): Promise<T> {
    if (this.pretendAs && method !== 'GET') throw new GerritError(`${method} ${path} refused: the board is read-only while shown as ${this.pretendAs.username ?? this.pretendAs._account_id}`, 0)
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
    return this.pretendAs ? Promise.resolve(this.pretendAs) : this.req('GET', '/accounts/self')
  }

  /** What the search queries call the signed-in user: `self`, or the account id of the person the board is shown as. */
  selfRef(): string {
    return this.pretendAs ? String(this.pretendAs._account_id) : 'self'
  }

  /** Runs several searches in one request; returns one array per query. */
  async queryChanges(queries: string[], limit = 300): Promise<ChangeInfo[][]> {
    const q = new URLSearchParams()
    for (const s of queries) q.append('q', s)
    q.set('n', String(limit))
    for (const o of CHANGE_OPTIONS) q.append('o', o)
    const result = await this.req<ChangeInfo[] | ChangeInfo[][]>('GET', '/changes/', undefined, q)
    // Gerrit returns a flat array for a single q= and an array of arrays for several.
    return queries.length === 1 ? [result as ChangeInfo[]] : (result as ChangeInfo[][])
  }

  /**
   * One change with the same fields as a search result, read from NoteDb
   * rather than the index, so a write made a moment ago is already in it.
   */
  change(id: number): Promise<ChangeInfo> {
    const q = new URLSearchParams()
    for (const o of CHANGE_OPTIONS) q.append('o', o)
    return this.req('GET', `/changes/${id}/detail`, undefined, q)
  }

  /**
   * The files patch set `patchSet` changed against patch set `base`, with
   * their line counts. Both are patch set numbers; Gerrit takes them as
   * revision ids. Keys starting with "/" are the commit message and merge list.
   */
  files(id: number, patchSet: number, base?: number): Promise<Record<string, FileInfo>> {
    return this.req('GET', `/changes/${id}/revisions/${patchSet}/files`, undefined, new URLSearchParams(base === undefined ? {} : { base: String(base) }))
  }

  /** Full context means both sides are complete, including every unchanged line. */
  async diff(link: ChangeLink, path: string): Promise<ReviewDiff> {
    if (!Number.isInteger(link.patchSet) || link.patchSet! < 1) throw new Error('A patch set is required for local review')
    const query = new URLSearchParams({ context: 'ALL', whitespace: 'IGNORE_NONE' })
    if (link.basePatchSet !== undefined) query.set('base', String(link.basePatchSet))
    const diff = await this.req<ReviewDiff>('GET', `/changes/${link.id}/revisions/${link.patchSet}/files/${encodeURIComponent(path)}/diff`, undefined, query)
    if (diff.binary) throw new Error('Binary files cannot be displayed in local review. Open this change in Gerrit.')
    if (!Array.isArray(diff.content) || diff.content.some((c) => c.skip)) throw new Error('Gerrit did not return the full file. Open this change in Gerrit.')
    return diff
  }

  reviewedFiles(link: ChangeLink): Promise<string[]> {
    return this.req('GET', `/changes/${link.id}/revisions/${link.patchSet}/files`, undefined, new URLSearchParams({ reviewed: '' }))
  }

  setFileReviewed(link: ChangeLink, path: string, reviewed: boolean): Promise<void> {
    return this.req(reviewed ? 'PUT' : 'DELETE', `/changes/${link.id}/revisions/${link.patchSet}/files/${encodeURIComponent(path)}/reviewed`)
  }

  comments(id: number, drafts = false): Promise<Record<string, ReviewComment[]>> {
    return this.req('GET', `/changes/${id}/${drafts ? 'drafts' : 'comments'}`)
  }
  capabilities(): Promise<Record<string, boolean>> { return this.req('GET', '/accounts/self/capabilities') }
  async saveDraft(id: number, patchSet: number, input: DraftCommentInput): Promise<ReviewComment> {
    const { id: draftId, ...body } = input
    // IDs returned by Gerrit are already URL encoded, unlike file paths.
    const draft = await this.req<ReviewComment>('PUT', `/changes/${id}/revisions/${patchSet}/drafts${draftId ? '/' + draftId : ''}`, body)
    return { ...draft, path: draft.path ?? input.path, patch_set: patchSet }
  }
  deleteDraft(id: number, patchSet: number, draftId: string): Promise<void> {
    return this.req('DELETE', `/changes/${id}/revisions/${patchSet}/drafts/${draftId}`)
  }
  async deleteComment(id: number, patchSet: number, commentId: string, reason: string): Promise<ReviewComment> {
    const result = await this.req<ReviewComment>('POST', `/changes/${id}/revisions/${patchSet}/comments/${commentId}/delete`, { reason })
    return { ...result, patch_set: patchSet }
  }
  async applyFix(id: number, patchSet: number, fixId: string): Promise<void> { await this.req('POST', `/changes/${id}/revisions/${patchSet}/fixes/${encodeURIComponent(fixId)}/apply`) }
  submitReview(link: ChangeLink, input: SubmitReviewInput): Promise<void> {
    return this.req('POST', `/changes/${link.id}/revisions/${link.patchSet}/review`, input)
  }

  setReady(id: number) {
    return this.req<void>('POST', `/changes/${id}/ready`, {})
  }

  setWip(id: number) {
    return this.req<void>('POST', `/changes/${id}/wip`, {})
  }

  /** Gerrit's private flag: on, only the owner, reviewers and CCs can see the change. */
  setPrivate(id: number, isPrivate: boolean) {
    return this.req<void>('POST', `/changes/${id}/${isPrivate ? 'private' : 'private.delete'}`, {})
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

  /**
   * One account by id, username, email or "Name <email>": what the primary
   * reviewer tag is written from. A group or an unknown name is a 404.
   */
  account(id: string): Promise<AccountInfo> {
    return this.req('GET', `/accounts/${encodeURIComponent(id)}/detail`)
  }

  removeReviewer(id: number, accountId: number) {
    return this.req<void>('POST', `/changes/${id}/reviewers/${accountId}/delete`, {})
  }

  suggestReviewers(id: number, q: string): Promise<SuggestedReviewerInfo[]> {
    const params = new URLSearchParams({ q, n: '8', 'reviewer-state': 'REVIEWER' })
    return this.req('GET', `/changes/${id}/suggest_reviewers`, undefined, params)
  }

  /** Account search for the team picker in Settings: name, username or email prefix. */
  suggestAccounts(q: string): Promise<AccountInfo[]> {
    const params = new URLSearchParams({ q: `is:active ${q}`, n: '8' })
    params.append('o', 'DETAILS')
    return this.req('GET', '/accounts/', undefined, params)
  }

  /**
   * The accounts behind usernames or email addresses, for showing a name for
   * a merger tag or a Settings entry. One query for all of them.
   */
  accountsByKey(keys: string[]): Promise<AccountInfo[]> {
    const terms = keys.map((k) => (k.includes('@') ? `email:${k}` : `username:${k}`))
    if (terms.length === 0) return Promise.resolve([])
    const params = new URLSearchParams({ q: terms.join(' OR '), n: String(keys.length + 5) })
    params.append('o', 'DETAILS')
    return this.req('GET', '/accounts/', undefined, params)
  }

  changeUrl(link: ChangeLink): string {
    return this.base + changePath(link)
  }
}
