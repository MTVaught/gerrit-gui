// What the UI can call. Implemented by the Electron preload
// (IPC to the main process) and by renderer/src/api.ts in browser mode (HTTP).
import type {
  AccountInfo,
  BadgePayload,
  ChangeAction,
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
  openChange(id: number): Promise<void>
  getUi(): Promise<UiState>
  setCompact(on: boolean): Promise<void>
  /** Tray/dock badge: what waits on me, by category, plus pre-rendered images for the trays that need them. */
  setBadge(payload: BadgePayload): void
  onCompactChanged(cb: (on: boolean) => void): () => void
  onRefreshRequested(cb: () => void): () => void
  /** The tray menu asked for a specific board tab. */
  onTabRequested(cb: (tab: TabId) => void): () => void

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
