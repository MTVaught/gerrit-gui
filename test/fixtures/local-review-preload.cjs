const { contextBridge } = require('electron')
let settings = { serverUrl: 'https://gerrit.example.com', username: 'alex', projects: [], teams: [], primaryTeam: '', mergers: [], badgeStyle: 'color', showZeroCounts: false, showAppBadge: false, showTrayCounts: false, compactOnTop: true, slackWorkspaces: [], localReview: false, hasPassword: true, encrypted: true }
const self = { _account_id: 1, username: 'alex', name: 'Alex Rivera', email: 'alex@example.com' }
const owner = { _account_id: 2, username: 'sam', name: 'Sam Chen', email: 'sam@example.com' }
const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
const change = { id: 'telemetry~main~Idemo', change_id: 'Idemo', _number: 2481, project: 'telemetry', branch: 'main', subject: 'Keep telemetry batches bounded under load', status: 'NEW', owner, created: now, updated: now, insertions: 8, deletions: 4, hashtags: ['reviewer:alex'], custom_keyed_values: { 'review-requested-ps': '3' }, reviewers: { REVIEWER: [self] }, labels: { 'Code-Review': { all: [{...self, value: 0}] } }, current_revision: 'demo-revision', revisions: { 'demo-revision': { _number: 3, created: now, commit: { subject: 'Keep telemetry batches bounded under load', message: 'Keep telemetry batches bounded under load\n\nFlush batches on size or timeout.' } } } }
const top = [
  '// Telemetry batch scheduler',
  '// Keep queued events bounded while preserving delivery order.',
  '',
  'import { Clock, Event, Transport } from "./types";',
  '',
  'export interface BatchOptions {',
  '  maxBatchSize: number;',
  '  flushIntervalMs: number;',
  '}',
  '',
  'export class BatchScheduler {',
  '  private pending: Event[] = [];',
  '  private timer: ReturnType<typeof setTimeout> | undefined;',
  '',
  '  constructor(',
  '    private readonly transport: Transport,',
  '    private readonly options: BatchOptions,',
  '    private readonly clock: Clock,',
  '  ) {}',
  '',
  '  enqueue(event: Event): void {',
  '    this.pending.push(event);',
  '',
]
const middle = ['', '    this.scheduleFlush();', '  }', '', '  private scheduleFlush(): void {', '    if (this.timer !== undefined) return;', '    this.timer = this.clock.setTimeout(() => {', '      this.timer = undefined;', '      void this.flush();', '    }, this.options.flushIntervalMs);', '  }', '', '  async flush(): Promise<void> {']
const tail = ['', '    await this.transport.send(batch);', '  }', '}', '', '// Delivery fixtures used by the scheduler stress tests.']
const unchanged = Array.from({ length: 99940 }, (_, i) => `export const deliveryCase${String(i + 1).padStart(5, '0')} = { retries: 2, timeoutMs: 5000 };`)
const patchSets = [1, 2, 3]
let requests = 0
const comparisons = []
const reviewedFlags = new Map()
const reviewedWrites = []
const drafts = new Map()
const comments = process.env.REVIEW_COMMENTS_FIXTURE ? [{ id: 'published-1', patch_set: 3, path: 'src/telemetry/batch-scheduler.ts', line: 2, side: 'REVISION', message: 'Please explain the unchanged setup.', updated: now, unresolved: true, author: owner }] : []
const commentWrites = []
const reviews = []
let failNextDraft = false
const appliedFixes = []
let draftCounter = 0
let historicalPositions = []
let canDeletePublished = false
const noOp = async () => undefined
const subscribe = () => () => undefined
contextBridge.exposeInMainWorld('api', {
  getSettings: async () => ({ ...settings }), saveSettings: async (s) => { settings = { ...s } },
  fetchChange: async () => change,
  fetchDashboard: async () => ({ self, open: [change], merged: [], fetchedAt: new Date().toISOString(), truncated: false }),
  getUi: async () => ({ compact: false }), getPretend: async () => null,
  getUpdateState: async () => ({ status: 'idle', currentVersion: '0.1.0', availableVersion: null, downloadedVersion: null, releaseNotes: null, releaseUrl: null, downloadPercent: null, checkedAt: null, message: null, errorContext: null }),
  onUpdateState: subscribe, onCompactChanged: subscribe, onSettingsChanged: subscribe, onRefreshRequested: subscribe, onTabRequested: subscribe, onConnectionChanged: subscribe,
  setBadge: () => undefined, lookupAccounts: async () => [],
  reviewCommentPositions: async () => historicalPositions,
  reviewBlame: async () => [{ author: 'Sam Chen', id: 'abc12345', time: Date.now() / 1000, commit_msg: 'Bound telemetry batches', ranges: [{ start: 1, end: 40 }] }],
  reviewDiffPreferences: async () => ({ context: -1, line_length: 100, tab_size: 4, font_size: 13, show_tabs: false, show_whitespace_errors: true, syntax_highlighting: true, manual_review: true, ignore_whitespace: 'IGNORE_NONE' }),
  saveReviewDiffPreferences: async input => input,
  previewReviewFix: async (_id, _ps, suggestion) => Object.fromEntries(suggestion.replacements.map(part => [part.path, { content: [{ a: ['old source'], b: part.replacement.split('\n') }]}])),
  applyProvidedReviewFix: async (id, patchSet, suggestion) => { appliedFixes.push({ id, patchSet, suggestion }) },
  openUrl: noOp,
  suggestReviewers: async () => [{ account: owner, count: 1 }],
  act: noOp,
  reviewDiscussion: async () => ({ comments: [...comments], drafts: [...drafts.values()], self, permittedLabels: { 'Code-Review': ['-2', '-1', '0', '+1', '+2'] }, labels: { 'Code-Review': { ...change.labels['Code-Review'], values: { '+1': 'Looks good' } } }, latestPatchSet: Math.max(...patchSets), owner, reviewers: { REVIEWER: [self], CC: [owner] }, attention: { 1: { account: self } }, readOnly: false, canDeletePublished }),
  saveReviewDraft: async (id, patchSet, input) => {
    await new Promise(r => setTimeout(r, 120))
    if (failNextDraft) { failNextDraft = false; throw new Error('Fixture draft save failed') }
    const draft = { ...input, id: input.id ?? 'draft-' + (++draftCounter), patch_set: patchSet, updated: new Date().toISOString() }
    if (draft.fix_suggestions) draft.fix_suggestions = draft.fix_suggestions.map((fix, i) => ({ ...fix, fix_id: 'fix-' + draft.id + '-' + i }))
    drafts.set(draft.id, draft); commentWrites.push(draft); return draft
  },
  fixtureCommentGaps: async () => {
    drafts.clear(); comments.splice(0)
    const file = 'src/telemetry/batch-scheduler.ts'
    const make = (id, line, message, extra = {}) => ({ id, patch_set: 3, path: file, line, side: 'REVISION', message, updated: now, unresolved: false, author: owner, ...extra })
    comments.push(make('single', 2, 'The setup now explains the **delivery ordering**. See [batch options](https://example.com/options) and `maxBatchSize`.\n\n> Preserve event order.', { context_lines: [{ line_number: 2, context_line: '// Keep queued events bounded while preserving delivery order.' }] }),
      make('chain-root', 8, 'Should the timeout be configurable?'),
      make('chain-reply', 8, 'Yes, it is passed in through BatchOptions.', { in_reply_to: 'chain-root', author: self, updated: new Date(Date.now() + 1000).toISOString() }),
      make('historical', 9998, 'Could we simplify timer cancellation?', { patch_set: 1, path: 'old-scheduler.ts', unresolved: true }))
    drafts.set('historical-draft', make('historical-draft', 9999, 'Saved privately on the earlier patch set.', { patch_set: 1, path: 'old-scheduler.ts', author: undefined, unresolved: true }))
    historicalPositions = [
      { id: 'historical', anchor: { patchSet: 3, path: file, side: 'REVISION', line: 14 } },
      { id: 'historical-draft', anchor: { patchSet: 3, path: file, side: 'REVISION', line: 18 } },
    ]
  },
  fixtureIncomingUpdate: async () => { patchSets.push(4); comments.push({ id: 'incoming', patch_set: 3, path: 'src/telemetry/batch-scheduler.ts', line: 11, side: 'REVISION', message: 'New feedback from another reviewer.', updated: new Date().toISOString(), author: owner, unresolved: true }) },
  fixtureOtherFileComment: async () => { comments.push({ id: 'other-file', patch_set: 3, path: 'src/telemetry/types.ts', line: 4, side: 'REVISION', message: 'Could we document this interface?', updated: new Date().toISOString(), author: owner, unresolved: true }) },
  fixtureAdmin: async value => { canDeletePublished = value },
  fixtureFailDraft: async () => { failNextDraft = true },
  applyReviewFix: async (id, patchSet, fixId) => { appliedFixes.push({ id, patchSet, fixId }) },
  deleteReviewDraft: async (id, patchSet, draftId) => { drafts.delete(draftId) },
  submitReview: async (link, input) => {
    reviews.push({ link, input })
    for (const [label, value] of Object.entries(input.labels)) change.labels[label] = { all: [{ ...self, value }] }
    for (const draft of [...drafts.values()]) if (input.drafts !== 'KEEP' && (input.drafts === 'PUBLISH_ALL_REVISIONS' || draft.patch_set === link.patchSet) && input.draft_ids_to_publish.includes(draft.id)) { comments.push({ ...draft, author: self }); drafts.delete(draft.id) }
  },
  reviewPatchSets: async () => [...patchSets],
  reviewReviewedFiles: async (link) => [...(reviewedFlags.get(link.patchSet) ?? [])],
  setReviewFileReviewed: async (link, path, reviewed) => {
    const flags = reviewedFlags.get(link.patchSet) ?? new Set()
    if (reviewed) flags.add(path); else flags.delete(path)
    reviewedFlags.set(link.patchSet, flags)
    reviewedWrites.push({ link, path, reviewed })
  },
  reviewFiles: async () => ({ 'src/telemetry/batch-scheduler.ts': { lines_inserted: 8, lines_deleted: 4 }, 'src/telemetry/types.ts': { lines_inserted: 2 } }),
  reviewDiff: async (_link, path) => {
    requests++
    comparisons.push({ link: _link, path })
    await new Promise((r) => setTimeout(r, 35))
    if (process.env.REVIEW_REBASE_FIXTURE) return { meta_a: { name: path }, meta_b: { name: path }, content: [
      { ab: ['// Mixed patch-set comparison', ''] },
      { a: ['const feature = false;'], b: ['const feature = true;'] },
      { ab: ['', '// Rebased upstream configuration'] },
      { a: ['const upstream = "old";'], b: ['const upstream = "new";'], due_to_rebase: true },
      { a: ['const local = 0;'], b: ['const local = 1;'] },
      { ab: ['', '// Whitespace-only upstream edit'] },
      { a: ['const spacing = 1;   '], b: ['const spacing = 1;'], due_to_rebase: true },
      { ab: ['', 'function existing() {'] },
      { a: ['  return false;'], b: ['  return true;'] },
      { ab: ['}', ''] },
      { b: ['function rebasedFunction() {', '  return false;', '}', ''], due_to_rebase: true },
      { ab: ['', '// End of comparison'] },
    ] }
    return { meta_a: { name: path, lines: 100000 }, meta_b: { name: path, lines: 100003 }, content: [
      { ab: [`// Comparing ${_link.basePatchSet ?? 'base'} to patch set ${_link.patchSet}`, '	// Tab marker and trailing whitespace   '] },
      { a: ['const whitespaceOnly = 1;   '], b: ['const whitespaceOnly = 1;'] },
      { ab: top },
      { a: ['    if (this.pending.length > this.options.maxBatchSize) {', '      void this.flush();'], b: ['    if (this.pending.length >= this.options.maxBatchSize) {', '      void this.flush();', '      return;'] },
      { ab: ['    }', ...middle] },
      { a: ['    const batch = this.pending;', '    this.pending = [];'], b: ['    const batch = this.pending.splice(0, this.options.maxBatchSize);', '    if (batch.length === 0) return;'] },
      { ab: [...tail, ...unchanged] },
      { a: ['export const flushAfterTimeout = false;'], b: ['export const flushAfterTimeout = true;'] },
      { ab: ['', '// End of delivery fixtures.'] },
    ] }
  },
  fixtureStats: async () => ({ requests, comparisons, reviewedWrites, commentWrites, reviews, drafts: [...drafts.values()], appliedFixes }),
  openChange: noOp, changeUrl: async () => 'https://gerrit.example.com/c/telemetry/+/2481',
  openConnection: noOp, setCompact: noOp,
})
