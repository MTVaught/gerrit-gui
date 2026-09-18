// What the UI can call. Implemented by the Electron preload
// (IPC to the main process) and by renderer/src/api.ts in browser mode (HTTP).
import type {
  AccountInfo,
  BadgePayload,
  ChangeAction,
  ChangeLink,
  DashboardData,
  SettingsInput,
  SettingsStatus,
  SuggestedReviewerInfo,
  TabId,
  UiState,
  UpdateState,
} from './types.ts'

export interface Api {
  getSettings(): Promise<SettingsStatus>
  saveSettings(input: SettingsInput): Promise<void>
  testConnection(): Promise<AccountInfo>
  fetchDashboard(): Promise<DashboardData>
  act(action: ChangeAction): Promise<void>
  suggestReviewers(id: number, q: string): Promise<SuggestedReviewerInfo[]>
  /** Gerrit accounts matching a name, username or email, for the team list in Settings. */
  suggestAccounts(q: string): Promise<AccountInfo[]>
  /** The accounts behind usernames or email addresses (merger tags, Settings entries). Unknown keys are left out. */
  lookupAccounts(keys: string[]): Promise<AccountInfo[]>
  /** Open the change, a patch set, or a patch-set diff in the browser. */
  openChange(link: ChangeLink): Promise<void>
  /** The same URL as a string, for copying. */
  changeUrl(link: ChangeLink): Promise<string>
  /** Open an https link (a Slack conversation) in the browser, or in the Slack app when Settings knows the workspace. */
  openUrl(url: string): Promise<void>
  getUi(): Promise<UiState>
  setCompact(on: boolean): Promise<void>
  /** Tray/dock badge: what waits on me, by category, plus pre-rendered images for the trays that need them. */
  setBadge(payload: BadgePayload): void
  onCompactChanged(cb: (on: boolean) => void): () => void
  /** Settings were changed outside the UI (tray menu); reload them. */
  onSettingsChanged(cb: () => void): () => void
  onRefreshRequested(cb: () => void): () => void
  /** The tray menu asked for a specific board tab. */
  onTabRequested(cb: (tab: TabId) => void): () => void

  // The connection (server, account, password) is edited in its own window.
  /** Open or raise the connection window. */
  openConnection(): Promise<void>
  /** From the connection window: the credentials were saved and tested; the board should reload. */
  connectionChanged(): Promise<void>
  /** From the connection window: close it. */
  closeConnection(): Promise<void>
  /** The connection window saved new credentials. */
  onConnectionChanged(cb: () => void): () => void

  // Application updates from GitHub releases. Each call resolves with the
  // state once the step has run; progress arrives through onUpdateState.
  getUpdateState(): Promise<UpdateState>
  checkForUpdate(): Promise<UpdateState>
  downloadUpdate(): Promise<UpdateState>
  /** Quit and install the downloaded update; with confirm, a native dialog asks first. */
  installUpdate(confirm: boolean): Promise<UpdateState>
  /** Open the GitHub release page of the offered version, or the releases list. */
  openReleaseNotes(): Promise<void>
  onUpdateState(cb: (state: UpdateState) => void): () => void
}
