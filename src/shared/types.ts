// Subset of Gerrit REST types used here (Gerrit 3.11 REST API, /changes/ with
// DETAILED_LABELS, DETAILED_ACCOUNTS, CURRENT_REVISION, SUBMITTABLE, SUBMIT_REQUIREMENTS).

export interface AccountInfo {
  _account_id: number
  name?: string
  email?: string
  username?: string
  /** "SERVICE_USER" marks bots (members of the Service Users group). */
  tags?: string[]
}

export interface ApprovalInfo extends AccountInfo {
  value?: number
  date?: string
}

export interface LabelInfo {
  all?: ApprovalInfo[]
  values?: Record<string, string>
  default_value?: number
}

export interface ActionInfo {
  method?: string
  label?: string
  title?: string
  /** Absent when false. */
  enabled?: boolean
}

export interface RevisionInfo {
  _number: number
  created: string
  uploader?: AccountInfo
  /** Present with CURRENT_ACTIONS; a key exists only if the calling user may perform it. */
  actions?: Record<string, ActionInfo>
}

export interface SubmitRequirementResultInfo {
  name: string
  status: 'SATISFIED' | 'UNSATISFIED' | 'OVERRIDDEN' | 'NOT_APPLICABLE' | 'ERROR' | 'FORCED'
}

export interface ChangeInfo {
  id: string
  _number: number
  project: string
  branch: string
  subject: string
  status: 'NEW' | 'MERGED' | 'ABANDONED'
  owner: AccountInfo
  work_in_progress?: boolean
  hashtags?: string[]
  created: string
  updated: string
  submitted?: string
  submittable?: boolean
  insertions?: number
  deletions?: number
  unresolved_comment_count?: number
  labels?: Record<string, LabelInfo>
  permitted_labels?: Record<string, string[]>
  reviewers?: { REVIEWER?: AccountInfo[]; CC?: AccountInfo[]; REMOVED?: AccountInfo[] }
  current_revision?: string
  revisions?: Record<string, RevisionInfo>
  submit_requirements?: SubmitRequirementResultInfo[]
  /** Set on the last entry of a query result when the limit cut it off. */
  _more_changes?: boolean
  /** Present with CUSTOM_KEYED_VALUES. */
  custom_keyed_values?: Record<string, string>
}

export interface SuggestedReviewerInfo {
  account?: AccountInfo
  group?: { id: string; name: string }
  count: number
}

/** Workflow state, derived purely from Gerrit data. */
export type ReviewState =
  | 'in-progress'
  | 'needs-review'
  | 'needs-changes'
  | 'approved'
  | 'ready-to-merge'
  | 'merged'
  | 'abandoned'

export interface ReviewerStatus {
  account: AccountInfo
  /** Code-Review vote on the current patch set; 0 = not reviewed yet. */
  vote: number
}

export interface ChangeView {
  change: ChangeInfo
  state: ReviewState
  /** Human reviewers (bots and the owner excluded). */
  reviewers: ReviewerStatus[]
  /** Reviewers who have not voted on the current patch set. */
  pending: AccountInfo[]
  /** Gerrit WIP flag. Independent of review state; commonly used to hold CI until review is done. */
  wip: boolean
  /** Patch set the author last requested review on, or null if never. */
  requestedPatchSet: number | null
  /** The request is for the current patch set, so reviews are outstanding. */
  reviewRequested: boolean
  isMine: boolean
  iAmReviewer: boolean
  needsMyReview: boolean
  myVote: number
  patchSet: number
  /** Hashtag says ready-to-merge but the approval no longer holds (e.g. new patch set). */
  staleReadyToMerge: boolean
  /**
   * This user may vote +2, which in this workflow is the merger's act:
   * reviewers only +1, and the merger's +2 and submit happen together.
   */
  canMerge: boolean
  canVote: { min: number; max: number }
}

/** How the macOS menu bar item shows the per-category action counts. */
export type BadgeStyle = 'color' | 'glyph'

export interface Settings {
  serverUrl: string
  username: string
  /** Colored pills, or monochrome glyphs for people who cannot tell the colors apart. */
  badgeStyle: BadgeStyle
  /**
   * Show every category in the menu bar even when its count is zero. With the
   * color style the strip is then pills only, without the app icon.
   */
  showZeroCounts: boolean
  /**
   * Optional project scope for the WIP scan (exact names, or a prefix ending
   * in "*"). Gerrit's reviewer: operator hides WIP changes, so the app has to
   * scan open WIP changes and filter client-side; on a big server, scope it.
   */
  projects: string[]
  /** Keep the compact window above other windows and on every workspace. */
  compactOnTop: boolean
}

export interface SettingsInput extends Settings {
  password?: string
}

export interface SettingsStatus extends Settings {
  hasPassword: boolean
  /** OS keychain encryption available for the stored password. */
  encrypted: boolean
}

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** UI state persisted across launches (not user settings). */
export interface UiState {
  compact: boolean
  bounds?: WindowBounds
  compactBounds?: WindowBounds
}

export type TabId = 'needs-my-review' | 'reviewing' | 'mine' | 'ready-to-merge' | 'merged'

/** Things that wait on the current user, one count per kind of action. */
export type ActionCategory = 'review' | 'fix' | 'ready' | 'merge'
export type ActionCounts = Record<ActionCategory, number>

/** What the renderer hands the tray after each refresh. */
export interface BadgePayload {
  counts: ActionCounts
  style: BadgeStyle
  showZeroCounts: boolean
  /** Square icon with the total baked in: Windows overlay, Linux tray. */
  iconDataUrl: string
  /** macOS menu bar strip (colored pills, with the icon unless showZeroCounts) at 2x, or null when not needed. */
  strip: { dataUrl: string; width: number; height: number } | null
}

export interface DashboardData {
  self: AccountInfo
  open: ChangeInfo[]
  merged: ChangeInfo[]
  fetchedAt: string
  /** Gerrit capped a result list; some changes may be missing. */
  truncated: boolean
}

export type ChangeAction =
  | { type: 'requestReview'; id: number; patchSet: number }
  | { type: 'withdrawReview'; id: number }
  | { type: 'setWip'; id: number; wip: boolean }
  /** Merger's action: vote +2 on the current patch set, then submit. */
  | { type: 'merge'; id: number }
  | { type: 'vote'; id: number; value: number; message?: string }
  | { type: 'hashtag'; id: number; add?: string[]; remove?: string[] }
  | { type: 'addReviewer'; id: number; reviewer: string }
  | { type: 'removeReviewer'; id: number; accountId: number }
