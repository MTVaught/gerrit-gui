// What the UI can call. Implemented by the Electron preload
// (IPC to the main process) and by renderer/src/api.ts in browser mode (HTTP).
import type {
  AccountInfo,
  BadgePayload,
  ChangeAction,
  ChangeInfo,
  ChangeInspection,
  ChangeLink,
  ReviewDiff,
  ReviewBlame,
  GerritDiffPreferences,
  FixSuggestion,
  ReviewDiscussion,
  ReviewCommentPosition,
  ReviewComment,
  DraftCommentInput,
  SubmitReviewInput,
  FileInfo,
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
  /** One change as the board shows it, read after an action on it so only that card is redrawn. */
  fetchChange(id: number): Promise<ChangeInfo>
  reviewBlame(link: ChangeLink, path: string): Promise<ReviewBlame[]>
  reviewDiffPreferences(): Promise<GerritDiffPreferences>
  saveReviewDiffPreferences(input: GerritDiffPreferences): Promise<GerritDiffPreferences>
  previewReviewFix(id: number, patchSet: number, fix: FixSuggestion): Promise<Record<string, ReviewDiff>>
  applyProvidedReviewFix(id: number, patchSet: number, fix: FixSuggestion): Promise<void>
  reviewFiles(link: ChangeLink): Promise<Record<string, FileInfo>>
  reviewDiff(link: ChangeLink, path: string): Promise<ReviewDiff>
  reviewPatchSets(id: number): Promise<number[]>
  reviewReviewedFiles(link: ChangeLink): Promise<string[]>
  setReviewFileReviewed(link: ChangeLink, path: string, reviewed: boolean): Promise<void>
  reviewDiscussion(id: number): Promise<ReviewDiscussion>
  reviewCommentPositions(link: ChangeLink): Promise<ReviewCommentPosition[]>
  saveReviewDraft(id: number, patchSet: number, input: DraftCommentInput): Promise<ReviewComment>
  deleteReviewDraft(id: number, patchSet: number, draftId: string): Promise<void>
  deleteReviewComment(id: number, patchSet: number, commentId: string, reason: string): Promise<ReviewComment>
  applyReviewFix(id: number, patchSet: number, fixId: string): Promise<void>
  submitReview(link: ChangeLink, input: SubmitReviewInput): Promise<void>
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
  /** One change by number, with the board's fields, for the Debug page in Settings. */
  inspectChange(id: number): Promise<ChangeInspection>
  /** Debug: the account the board is shown as instead of the signed-in one, or null. Not kept across restarts. */
  getPretend(): Promise<AccountInfo | null>
  /**
   * Debug: show the board as `key` (username, email or account id) sees it,
   * read-only, until a null stops it. Waits for outstanding actions to finish
   * before switching; new actions are refused during the switch. Resolves
   * with the account, or throws when no account matches.
   */
  setPretend(key: string | null): Promise<AccountInfo | null>
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
