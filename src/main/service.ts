// Everything the UI can ask for, independent of Electron. The Electron main
// process exposes it over IPC; src/server exposes it over local HTTP for
// running the UI in a browser (e.g. over VS Code port forwarding).
import { GerritClient, GerritError, type FetchLike } from './gerrit.ts'
import { fetchDashboard } from './dashboard.ts'
import { REVIEW_REQUESTED_KEY } from '../shared/constants.ts'
import type {
  AccountInfo,
  ChangeAction,
  ChangeLink,
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
  act(action: ChangeAction): Promise<void>
  suggestReviewers(id: number, q: string): Promise<SuggestedReviewerInfo[]>
  suggestAccounts(q: string): Promise<AccountInfo[]>
  changeUrl(link: ChangeLink): Promise<string>
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
  async function client(): Promise<GerritClient> {
    const creds = await store.getCredentials()
    if (!creds) throw new Error('Gerrit server and credentials are not configured')
    return new GerritClient(creds.serverUrl, creds.username, creds.password, fetchImpl)
  }

  return {
    getSettings: () => store.getStatus(),
    saveSettings: (input) => store.save(input),

    async testConnection() {
      const g = await client()
      try {
        return await g.self()
      } catch (e) {
        throw new Error(explainConnectionError(e))
      }
    },

    async fetchDashboard() {
      const [g, status] = await Promise.all([client(), store.getStatus()])
      return fetchDashboard(g, status.projects)
    },

    async act(action) {
      const g = await client()
      switch (action.type) {
        case 'requestReview':
          await g.setCustomKeyedValues(action.id, { [REVIEW_REQUESTED_KEY]: String(action.patchSet) })
          return
        case 'withdrawReview':
          await g.setCustomKeyedValues(action.id, {}, [REVIEW_REQUESTED_KEY])
          return
        case 'setWip':
          await (action.wip ? g.setWip(action.id) : g.setReady(action.id))
          return
        case 'merge': {
          // The merger's +2 is the approval-to-merge itself; submit right after.
          await g.vote(action.id, 'Code-Review', 2)
          try {
            await g.submit(action.id)
          } catch (e) {
            throw new Error(
              `Voted +2 but submit failed: ${(e as Error).message}. The change is now submittable by anyone with Submit permission.`,
            )
          }
          return
        }
        case 'hashtag':
          await g.setHashtags(action.id, action.add, action.remove)
          return
        case 'addReviewer':
          await g.addReviewer(action.id, action.reviewer)
          return
        case 'removeReviewer':
          await g.removeReviewer(action.id, action.accountId)
          return
      }
    },

    suggestReviewers: async (id, q) => (await client()).suggestReviewers(id, q),
    suggestAccounts: async (q) => (await client()).suggestAccounts(q),
    changeUrl: async (link) => (await client()).changeUrl(link),
  }
}
