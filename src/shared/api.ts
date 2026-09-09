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
} from './types.ts'

export interface Api {
  getSettings(): Promise<SettingsStatus>
  saveSettings(input: SettingsInput): Promise<void>
  testConnection(): Promise<AccountInfo>
  fetchDashboard(): Promise<DashboardData>
  act(action: ChangeAction): Promise<void>
  suggestReviewers(id: number, q: string): Promise<SuggestedReviewerInfo[]>
  /** Open the change, a patch set, or a patch-set diff in the browser. */
  openChange(link: ChangeLink): Promise<void>
  /** The same URL as a string, for copying. */
  changeUrl(link: ChangeLink): Promise<string>
  getUi(): Promise<UiState>
  setCompact(on: boolean): Promise<void>
  /** Tray/dock badge: what waits on me, by category, plus pre-rendered images for the trays that need them. */
  setBadge(payload: BadgePayload): void
  onCompactChanged(cb: (on: boolean) => void): () => void
  onRefreshRequested(cb: () => void): () => void
  /** The tray menu asked for a specific board tab. */
  onTabRequested(cb: (tab: TabId) => void): () => void
}
