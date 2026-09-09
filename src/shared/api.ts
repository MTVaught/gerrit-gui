// What the UI can call. Implemented by the Electron preload
// (IPC to the main process) and by renderer/src/api.ts in browser mode (HTTP).
import type {
  AccountInfo,
  ChangeAction,
  DashboardData,
  SettingsInput,
  SettingsStatus,
  SuggestedReviewerInfo,
  UiState,
} from './types.ts'

export interface Api {
  getSettings(): Promise<SettingsStatus>
  saveSettings(input: SettingsInput): Promise<void>
  testConnection(): Promise<AccountInfo>
  fetchDashboard(): Promise<DashboardData>
  act(action: ChangeAction): Promise<void>
  suggestReviewers(id: number, q: string): Promise<SuggestedReviewerInfo[]>
  openChange(id: number): Promise<void>
  getUi(): Promise<UiState>
  setCompact(on: boolean): Promise<void>
  /** Tray/dock badge: how many changes need my review, plus a pre-rendered icon for platforms without text badges. */
  setBadge(count: number, iconDataUrl: string): void
  onCompactChanged(cb: (on: boolean) => void): () => void
  onRefreshRequested(cb: () => void): () => void
}
