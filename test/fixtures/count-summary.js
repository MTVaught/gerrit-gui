import RefreshRuntime from '/@react-refresh'
RefreshRuntime.injectIntoGlobalHook(window)
window.$RefreshReg$ = () => {}
window.$RefreshSig$ = () => type => type
window.__vite_plugin_react_preamble_installed__ = true

// Deterministic, credential-free board fixture for collaborative browser checks.
// Open with Vite at /@fs/<repo>/test/fixtures/count-summary.html#tab=mine.
const self = { _account_id: 1, username: 'alice', name: 'Alice' }
const bob = { _account_id: 2, username: 'bob', name: 'Bob' }
const carol = { _account_id: 3, username: 'carol', name: 'Carol' }
const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
function change(n, subject, state, extra = {}) {
  const requested = !['in-progress', 'iterating'].includes(state)
  const vote = state === 'needs-changes' ? -1 : ['approved', 'ready-to-merge'].includes(state) ? 1 : 0
  return {
    id: `demo~main~I${n}`, change_id: `I${n}`, _number: n, project: 'demo', branch: 'main',
    subject, status: 'NEW', owner: self, created: now, updated: now,
    insertions: 24, deletions: 6, hashtags: ['reviewer:bob', ...(state === 'ready-to-merge' ? ['ready-to-merge', 'merger:bob'] : [])],
    reviewers: { REVIEWER: [bob] }, labels: { 'Code-Review': { all: [{ ...bob, value: vote }] }, Verified: { all: [{ ...carol, value: 1 }] } },
    current_revision: `sha${n}`, revisions: { [`sha${n}`]: { _number: 2, created: now, commit: { parents: [{ commit: 'tip' }] } } },
    custom_keyed_values: {
      ...(requested ? { 'review-requested-ps': '2' } : state === 'iterating' ? { 'review-requested-ps': '1' } : {}),
      ...(state === 'in-person-review' ? { 'in-person-review-ps': '2' } : {}),
      ...(state === 'ready-to-merge' ? { 'ready-to-merge-ps': '2' } : {}),
    },
    messages: state === 'iterating' ? [{ id: `vote${n}`, author: bob, date: now, message: 'Patch Set 1: Code-Review-1', _revision_number: 1 }] : [],
    ...extra,
  }
}
const changes = [
  change(101, 'Storage: validate schema migrations', 'needs-changes', { hashtags: ['reviewer:bob', 'sequence'], topic: 'storage-migration' }),
  change(102, 'Storage: publish the migration runner', 'ready-to-merge', {
    hashtags: ['reviewer:bob', 'sequence', 'ready-to-merge', 'merger:bob'], topic: 'storage-migration',
    revisions: { sha102: { _number: 2, created: now, commit: { parents: [{ commit: 'sha101' }] } } },
  }),
  change(103, 'Storage: retire the legacy loader', 'in-progress', {
    hashtags: ['reviewer:bob', 'sequence'], topic: 'storage-migration',
    revisions: { sha103: { _number: 2, created: now, commit: { parents: [{ commit: 'sha102' }] } } },
  }),
  change(104, 'Storage: finish the migration checks', 'approved', { hashtags: ['reviewer:bob', 'sequence'], topic: 'storage-migration',
    revisions: { sha104: { _number: 2, created: now, commit: { parents: [{ commit: 'sha103' }] } } },
  }),
  change(105, 'Storage: prepare the schema', 'merged', { status: 'MERGED', hashtags: ['reviewer:bob', 'sequence'], topic: 'storage-migration',
    revisions: { sha105: { _number: 2, created: now, commit: { parents: [{ commit: 'sha104' }] } } },
  }),
  change(106, 'Telemetry: batch delivery events', 'approved', { change_id: 'Itelemetry' }),
  change(107, 'Telemetry: batch delivery events', 'needs-review', { change_id: 'Itelemetry', branch: 'release' }),
  change(108, 'Telemetry: batch delivery events', 'approved', { change_id: 'Itelemetry', branch: 'other', owner: carol, reviewers: { REVIEWER: [bob, self] } }),
  change(109, 'Network: review retry behavior together', 'in-person-review'),
  change(110, 'Settings: address review feedback', 'iterating'),
  change(111, 'Cache: prepare invalidation changes', 'in-progress'),
  change(112, 'Archive: deferred prototype', 'approved', { is_private: true }),
  // Review and merge responsibilities for other people's work, not My Changes.
  change(201, 'API: review pagination', 'needs-review', { owner: bob, reviewers: { REVIEWER: [self] }, hashtags: ['reviewer:alice'] }),
  change(202, 'API: merge cursor support', 'ready-to-merge', { owner: bob, hashtags: ['reviewer:alice', 'ready-to-merge', 'merger:alice'],
    reviewers: { REVIEWER: [self] }, labels: { 'Code-Review': { all: [{ ...self, value: 1 }] } },
  }),
]
const variant = new URLSearchParams(location.search).get('variant')
const conflictChanges = changes.map(c => ({ ...c,
  mergeable: [102, 105, 106, 109, 112].includes(c._number) ? false : c._number === 108 ? undefined : true,
  labels: { ...c.labels, Verified: { all: c._number === 109 ? [] : [{ ...carol, value: c._number === 106 ? -1 : 1 }] } },
}))
const active = variant === 'conflict' ? conflictChanges : variant === 'private-sequence' ? changes.map(c => c._number === 104 ? { ...c, is_private: true } : c) : variant === 'progress' ? changes.filter(c => c._number === 111) : variant === 'private' ? changes.filter(c => c.is_private) : variant === 'empty' ? [] : changes
const subscribe = () => () => {}
let onCompact = () => {}
let badge = null
window.countSummaryFixture = { changes: active, get badge() { return badge } }
window.api = {
  getSettings: async () => ({ serverUrl: 'https://gerrit.example.test', username: 'alice', hasPassword: true,
    projects: ['demo'], teams: [{ name: 'Core', members: ['alice', 'bob'], watched: true }], primaryTeam: 'Core',
    mergers: [], localReview: false, theme: 'system' }),
  getUi: async () => ({ compact: /compact/.test(location.hash) }), getPretend: async () => null,
  getUpdateState: async () => ({ status: 'idle', currentVersion: '0.1.0' }),
  onUpdateState: subscribe, onSettingsChanged: subscribe, onRefreshRequested: subscribe, onTabRequested: subscribe, onConnectionChanged: subscribe,
  onNativeReviewRequested: subscribe, setNativeReviewReady: () => {}, acknowledgeNativeReview: () => {},
  onCompactChanged: cb => { onCompact = cb; return () => {} }, setCompact: async on => onCompact(on),
  setBadge: payload => { badge = payload }, lookupAccounts: async () => [self, bob, carol],
  suggestAccounts: async () => [self, bob, carol],
  fetchDashboard: async () => {
    // Conflict checks mutate the simulated server between reads, never the
    // renderer's previous snapshot. Absent mergeability simulates a failed lookup.
    const snapshot = variant === 'conflict' ? structuredClone(active) : active
    return { self, open: snapshot.filter(c => c.status === 'NEW'), merged: snapshot.filter(c => c.status === 'MERGED'), fetchedAt: new Date().toISOString(), truncated: false }
  },
  fetchChange: async id => variant === 'conflict' ? structuredClone(active.find(c => c._number === id)) : active.find(c => c._number === id),
  openChange: async () => {}, openUrl: async () => {},
}
await import('/src/main.tsx')
