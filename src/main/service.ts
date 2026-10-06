// Everything the UI can ask for, independent of Electron. The Electron main
// process exposes it over IPC; src/server exposes it over local HTTP for
// running the UI in a browser (e.g. over VS Code port forwarding).
import { GerritClient, GerritError, type FetchLike } from './gerrit.ts'
import { fetchChange, fetchDashboard } from './dashboard.ts'
import { IN_PERSON_REVIEW_KEY, READY_TO_MERGE_KEY, READY_TO_MERGE_TAG, REVIEW_REQUESTED_KEY, SEQUENCE_TAG } from '../shared/constants.ts'
import { mergerTag, preferredKey, requestedPatchSetsValue, reviewerTag, teamMembers } from '../shared/model.ts'
import type {
  AccountInfo,
  ChangeAction,
  ChangeInfo,
  ChangeInspection,
  ChangeLink,
  ReviewDiff,
  ReviewDiscussion,
  ReviewComment,
  DraftCommentInput,
  SubmitReviewInput,
  FileInfo,
  DashboardData,
  SettingsInput,
  SettingsStatus,
  SuggestedReviewerInfo,
} from '../shared/types.ts'

export interface Credentials {
  serverUrl: string
  username: string
  password: string
}

export interface SettingsStore {
  getStatus(): Promise<SettingsStatus>
  getCredentials(): Promise<Credentials | null>
  save(input: SettingsInput): Promise<void>
}

export interface Service {
  getSettings(): Promise<SettingsStatus>
  saveSettings(input: SettingsInput): Promise<void>
  testConnection(): Promise<AccountInfo>
  fetchDashboard(): Promise<DashboardData>
  /** One change, fresh from Gerrit, for updating the board after an action on it. */
  fetchChange(id: number): Promise<ChangeInfo>
  reviewFiles(link: ChangeLink): Promise<Record<string, FileInfo>>
  reviewDiff(link: ChangeLink, path: string): Promise<ReviewDiff>
  reviewPatchSets(id: number): Promise<number[]>
  reviewReviewedFiles(link: ChangeLink): Promise<string[]>
  setReviewFileReviewed(link: ChangeLink, path: string, reviewed: boolean): Promise<void>
  reviewDiscussion(id: number): Promise<ReviewDiscussion>
  saveReviewDraft(id: number, patchSet: number, input: DraftCommentInput): Promise<ReviewComment>
  deleteReviewDraft(id: number, patchSet: number, draftId: string): Promise<void>
  deleteReviewComment(id: number, patchSet: number, commentId: string, reason: string): Promise<ReviewComment>
  applyReviewFix(id: number, patchSet: number, fixId: string): Promise<void>
  submitReview(link: ChangeLink, input: SubmitReviewInput): Promise<void>
  act(action: ChangeAction): Promise<void>
  suggestReviewers(id: number, q: string): Promise<SuggestedReviewerInfo[]>
  suggestAccounts(q: string): Promise<AccountInfo[]>
  /** Accounts for usernames or email addresses; keys with no account are left out. */
  lookupAccounts(keys: string[]): Promise<AccountInfo[]>
  changeUrl(link: ChangeLink): Promise<string>
  /** One change read from NoteDb, plus the signed-in account, for the Debug page. */
  inspectChange(id: number): Promise<ChangeInspection>
  /** The account the board is shown as instead of the signed-in one (Debug page), or null. */
  getPretend(): Promise<AccountInfo | null>
  /** Show the board as `key` sees it, read-only, or stop with null. Resolves with the account. */
  setPretend(key: string | null): Promise<AccountInfo | null>
}

/**
 * The username behind whatever names an account (username, email, id), for
 * the keys the application writes. An unknown key is kept as typed, so an
 * entry the server cannot resolve still tags something.
 */
async function usernameFor(g: GerritClient, key: string): Promise<string> {
  try {
    return preferredKey(await g.account(key)) ?? key
  } catch (e) {
    if ((e as GerritError).status === 404) return key
    throw e
  }
}

/** Turn a failed /accounts/self call into something a user can act on. */
export function explainConnectionError(e: unknown): string {
  const err = e as GerritError
  const msg = err.message ?? String(e)
  if (!(err instanceof GerritError)) return msg
  switch (err.status) {
    case 404:
      return `${msg}\nThe server answered, but not at that path. Include the prefix Gerrit is mounted under, such as https://host/gerrit1. Pasting any change URL works too; the app trims it.`
    case 401:
    case 403:
      return `${msg}\nCheck the username and HTTP password (generated in Gerrit under Settings, HTTP Credentials). On LDAP-backed servers with gitBasicAuthPolicy=LDAP, use your LDAP password instead.`
    case 0:
      if (/ERR_CERT|ERR_SSL|CERT|certificate|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(msg)) {
        return `${msg}\nThe operating system does not trust the server's TLS certificate. Install the CA in the system trust store and relaunch: macOS Keychain (System or login, marked Always Trust), the Windows certificate store, or on Linux the NSS database: certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Private CA" -i ca.crt`
      }
      return `${msg}\nCheck the host name, VPN, and proxy.`
    default:
      return msg
  }
}

export function createService(store: SettingsStore, fetchImpl: FetchLike): Service {
  // Who the board is shown as, when not the signed-in user: set on the Debug
  // page, kept for the life of the process only. Every client handed out
  // while it is set is read-only (see GerritClient.pretendAs).
  let pretend: AccountInfo | null = null
  let switchingPretend = false
  let activeActions = 0
  let actionsDrained: (() => void) | undefined

  /** A client as the signed-in user, whatever the Debug page says. */
  async function realClient(): Promise<GerritClient> {
    const creds = await store.getCredentials()
    if (!creds) throw new Error('Gerrit server and credentials are not configured')
    return new GerritClient(creds.serverUrl, creds.username, creds.password, fetchImpl)
  }

  async function client(): Promise<GerritClient> {
    const g = await realClient()
    g.pretendAs = pretend
    return g
  }

  async function withWrite<T>(run: () => Promise<T>): Promise<T> {
    if (pretend) throw new Error(`Nothing was changed: the board is shown as ${pretend.name ?? pretend.username ?? pretend._account_id} and read-only. Stop pretending in Settings › Debug first.`)
    if (switchingPretend) throw new Error('Nothing was changed: waiting for outstanding actions before switching the board. Try again when the switch finishes.')
    // Register before the first await, including time spent obtaining credentials.
    activeActions++
    try {
      return await run()
    } finally {
      activeActions--
      if (activeActions === 0) {
        actionsDrained?.()
        actionsDrained = undefined
      }
    }
  }

  return {
    getSettings: () => store.getStatus(),
    saveSettings: (input) => store.save(input),

    async testConnection() {
      const g = await realClient()
      try {
        return await g.self()
      } catch (e) {
        throw new Error(explainConnectionError(e))
      }
    },

    async fetchDashboard() {
      const [g, status] = await Promise.all([client(), store.getStatus()])
      return fetchDashboard(g, status.projects, teamMembers(status))
    },

    async fetchChange(id) {
      return fetchChange(await client(), id)
    },

    reviewFiles: async (link) => (await client()).files(link.id, link.patchSet!, link.basePatchSet),
    reviewDiff: async (link, path) => (await client()).diff(link, path),
    reviewPatchSets: async (id) => Object.values((await (await client()).change(id)).revisions ?? {}).map((r) => r._number).sort((a, b) => a - b),
    reviewReviewedFiles: async (link) => (await client()).reviewedFiles(link),
    setReviewFileReviewed: (link, path, reviewed) => withWrite(async () => (await client()).setFileReviewed(link, path, reviewed)),

    async reviewDiscussion(id) {
      const g = await client()
      const [comments, drafts, self, change, capabilities] = await Promise.all([
        g.comments(id), pretend ? Promise.resolve({}) : g.comments(id, true), g.self(), g.change(id),
        pretend ? Promise.resolve({}) : g.capabilities().catch((e: GerritError) => { if (e.status === 403 || e.status === 404) return {}; throw e }),
      ])
      const flatten = (map: Record<string, ReviewComment[]>) => Object.entries(map).flatMap(([path, list]) => list.map((c) => ({ ...c, path })))
      return { comments: flatten(comments), drafts: flatten(drafts), self,
        permittedLabels: pretend ? {} : change.permitted_labels ?? {}, labels: change.labels ?? {},
        latestPatchSet: Math.max(0, ...Object.values(change.revisions ?? {}).map((r) => r._number)),
        readOnly: Boolean(pretend), canDeletePublished: Boolean((capabilities as Record<string, boolean>).administrateServer),
      }
    },
    saveReviewDraft: (id, patchSet, input) => withWrite(async () => (await client()).saveDraft(id, patchSet, input)),
    deleteReviewDraft: (id, patchSet, draftId) => withWrite(async () => (await client()).deleteDraft(id, patchSet, draftId)),
    deleteReviewComment: (id, patchSet, commentId, reason) => withWrite(async () => (await client()).deleteComment(id, patchSet, commentId, reason)),
    applyReviewFix: (id, patchSet, fixId) => withWrite(async () => (await client()).applyFix(id, patchSet, fixId)),
    submitReview: (link, input) => withWrite(async () => (await client()).submitReview(link, input)),

    async act(action) {
      return withWrite(async () => {
        const g = await client()
        switch (action.type) {
          case 'requestReview':
            // A ready-to-merge tag (and the merger named with it) from an earlier
            // patch set has no meaning once the author restarts the review, so
            // it goes with the request.
            if (action.clearTags?.length) await g.setHashtags(action.id, undefined, action.clearTags)
            // The patch set joins the ones asked before, so the rounds stay on record.
            // The kind goes with the request: an in-person one records its patch set, a pass-around one drops any earlier record.
            await g.setCustomKeyedValues(
              action.id,
              { [REVIEW_REQUESTED_KEY]: requestedPatchSetsValue(action.history, action.patchSet), ...(action.inPerson ? { [IN_PERSON_REVIEW_KEY]: String(action.patchSet) } : {}) },
              [...(action.inPerson ? [] : [IN_PERSON_REVIEW_KEY]), ...(action.clearTags?.length ? [READY_TO_MERGE_KEY] : [])],
            )
            return
          case 'setReviewKind':
            // The round stays as it is; only the kind of the open request changes.
            await g.setCustomKeyedValues(action.id, action.inPerson ? { [IN_PERSON_REVIEW_KEY]: String(action.patchSet) } : {}, action.inPerson ? [] : [IN_PERSON_REVIEW_KEY])
            return
          case 'requestMerge': {
            // The state tag and the addressee go in one request; a previous
            // merger tag leaves in the same one, so exactly one person is named.
            const tag = mergerTag(await usernameFor(g, action.merger))
            const remove = (action.replace ?? []).filter((t) => t !== tag)
            await g.setHashtags(action.id, [READY_TO_MERGE_TAG, tag], remove)
            // The patch set the tag is for. Only the owner can write it, which
            // is who asks; the clears leave it behind, since the tag gates it.
            await g.setCustomKeyedValues(action.id, { [READY_TO_MERGE_KEY]: String(action.patchSet) })
            return
          }
          case 'withdrawReview': {
            // The latest round comes off the list; earlier ones stay on record.
            // The kind marker is for the open request only, so it goes too.
            const keep = action.history.slice(0, -1)
            await g.setCustomKeyedValues(action.id, keep.length > 0 ? { [REVIEW_REQUESTED_KEY]: keep.join(',') } : {}, [...(keep.length > 0 ? [] : [REVIEW_REQUESTED_KEY]), IN_PERSON_REVIEW_KEY])
            return
          }
          case 'setWip':
            await (action.wip ? g.setWip(action.id) : g.setReady(action.id))
            return
          case 'setPrivate':
            await g.setPrivate(action.id, action.private)
            return
          case 'hashtag':
            await g.setHashtags(action.id, action.add, action.remove)
            return
          case 'setSequence':
            // One request per change; Gerrit has no bulk tag write.
            for (const n of action.add) await g.setHashtags(n, [SEQUENCE_TAG])
            for (const n of action.remove) await g.setHashtags(n, [], [SEQUENCE_TAG])
            return
          case 'addReviewer':
            await g.addReviewer(action.id, action.reviewer)
            return
          case 'removeReviewer':
            await g.removeReviewer(action.id, action.accountId)
            return
          case 'addPrimaryReviewer': {
            // The tag names a person, so the input has to be one account. The
            // lookup also turns whatever was typed into the username (or the
            // email of an account without one), which is what the tag stores.
            let account: AccountInfo
            try {
              account = await g.account(action.reviewer)
            } catch (e) {
              if ((e as GerritError).status === 404) throw new Error(`No account matches "${action.reviewer}". A primary reviewer is one person; groups cannot be tagged.`)
              throw e
            }
            const key = preferredKey(account)
            if (!key) throw new Error(`${account.name ?? action.reviewer} has neither a username nor an email address, so there is nothing to tag.`)
            // Adding an existing reviewer is a no-op in Gerrit, so no check first.
            await g.addReviewer(action.id, String(account._account_id))
            await g.setHashtags(action.id, [reviewerTag(key)])
            return
          }
          case 'removePrimaryReviewer': {
            // The tag is what makes the person primary and anyone may edit it;
            // the reviewer row in Gerrit belongs to the owner, so that step may
            // be refused and the person then stays on the change as a plain
            // reviewer.
            await g.setHashtags(action.id, [], [reviewerTag(action.key)])
            if (action.accountId === undefined) return
            try {
              await g.removeReviewer(action.id, action.accountId)
            } catch (e) {
              if ((e as GerritError).status !== 403) throw e
            }
            return
          }
        }
      })
    },

    suggestReviewers: async (id, q) => (await client()).suggestReviewers(id, q),
    suggestAccounts: async (q) => (await client()).suggestAccounts(q),
    lookupAccounts: async (keys) => (keys.length ? (await client()).accountsByKey(keys) : []),
    changeUrl: async (link) => (await client()).changeUrl(link),
    async inspectChange(id) {
      const g = await client()
      const [self, change] = await Promise.all([g.self(), g.change(id)])
      return { self, change }
    },

    getPretend: async () => pretend,
    async setPretend(key) {
      if (switchingPretend) throw new Error('The board is already switching. Wait for the switch to finish.')
      // Close admission before waiting, so new actions cannot prolong the wait
      // or retain a writable client across the mode change.
      switchingPretend = true
      try {
        if (activeActions > 0) await new Promise<void>((resolve) => { actionsDrained = resolve })
        if (key === null || key.trim() === '') {
          pretend = null
          return null
        }
        const g = await realClient()
        try {
          pretend = await g.account(key.trim())
        } catch (e) {
          if ((e as GerritError).status === 404) throw new Error(`No account matches "${key}". Enter a username, an email address or an account id.`)
          throw e
        }
        return pretend
      } finally {
        switchingPretend = false
      }
    },
  }
}
