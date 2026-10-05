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
let requests = 0
const noOp = async () => undefined
const subscribe = () => () => undefined
contextBridge.exposeInMainWorld('api', {
  getSettings: async () => ({ ...settings }), saveSettings: async (s) => { settings = { ...s } },
  fetchDashboard: async () => ({ self, open: [change], merged: [], fetchedAt: new Date().toISOString(), truncated: false }),
  getUi: async () => ({ compact: false }), getPretend: async () => null,
  getUpdateState: async () => ({ status: 'idle', currentVersion: '0.1.0', availableVersion: null, downloadedVersion: null, releaseNotes: null, releaseUrl: null, downloadPercent: null, checkedAt: null, message: null, errorContext: null }),
  onUpdateState: subscribe, onCompactChanged: subscribe, onSettingsChanged: subscribe, onRefreshRequested: subscribe, onTabRequested: subscribe, onConnectionChanged: subscribe,
  setBadge: () => undefined, lookupAccounts: async () => [],
  reviewFiles: async () => ({ 'src/telemetry/batch-scheduler.ts': { lines_inserted: 8, lines_deleted: 4 }, 'src/telemetry/types.ts': { lines_inserted: 2 } }),
  reviewDiff: async (_link, path) => {
    requests++
    await new Promise((r) => setTimeout(r, 35))
    return { meta_a: { name: path, lines: 100000 }, meta_b: { name: path, lines: 100003 }, content: [
      { ab: top },
      { a: ['    if (this.pending.length > this.options.maxBatchSize) {', '      void this.flush();'], b: ['    if (this.pending.length >= this.options.maxBatchSize) {', '      void this.flush();', '      return;'] },
      { ab: ['    }', ...middle] },
      { a: ['    const batch = this.pending;', '    this.pending = [];'], b: ['    const batch = this.pending.splice(0, this.options.maxBatchSize);', '    if (batch.length === 0) return;'] },
      { ab: [...tail, ...unchanged] },
      { a: ['export const flushAfterTimeout = false;'], b: ['export const flushAfterTimeout = true;'] },
      { ab: ['', '// End of delivery fixtures.'] },
    ] }
  },
  fixtureStats: async () => ({ requests }),
  openChange: noOp, changeUrl: async () => 'https://gerrit.example.com/c/telemetry/+/2481',
  openConnection: noOp, setCompact: noOp,
})
