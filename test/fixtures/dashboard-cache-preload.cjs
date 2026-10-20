const { contextBridge } = require('electron')
const self = { _account_id: 1, username: 'alice', name: 'Alice' }
const reviewer = { _account_id: 2, username: 'bob', name: 'Bob' }
const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
let detail = { id: 'demo~1', _number: 1, project: 'demo', branch: 'main', subject: 'Re-request cache regression', status: 'NEW', owner: self,
  created: now, updated: now, hashtags: ['reviewer:bob'], reviewers: { REVIEWER: [reviewer] },
  current_revision: 'ps2', revisions: { ps1: { _number: 1, created: now }, ps2: { _number: 2, created: now } },
  custom_keyed_values: { 'review-requested-ps': '1' },
  messages: [{ id: 'vote', author: reviewer, date: now, message: 'Patch Set 1: Code-Review-1', _revision_number: 1 }] }
let indexed = structuredClone(detail)
let heldSearch
let releaseSearch
let holdNext = false
const stats = { writes: 0, searches: 0, details: 0, held: false }
const subscribe = () => () => {}
contextBridge.exposeInMainWorld('api', {
  getSettings: async () => ({ serverUrl: 'https://gerrit.example.com', username: 'alice', projects: ['demo'], teams: [], primaryTeam: '', mergers: [], hasPassword: true, localReview: false }),
  getUi: async () => ({ compact: false }), getPretend: async () => null,
  getUpdateState: async () => ({ status: 'idle', currentVersion: '0.1.0' }),
  onUpdateState: subscribe, onCompactChanged: subscribe, onSettingsChanged: subscribe, onRefreshRequested: subscribe, onTabRequested: subscribe, onConnectionChanged: subscribe,
  onNativeReviewRequested: subscribe, setNativeReviewReady: () => {}, acknowledgeNativeReview: () => {},
  setBadge: () => {}, lookupAccounts: async () => [], notify: () => {},
  fetchChange: async () => { stats.details++; return structuredClone(detail) },
  fetchDashboard: async () => {
    stats.searches++
    const snapshot = { self, open: [structuredClone(indexed)], merged: [], fetchedAt: new Date().toISOString(), truncated: false }
    if (holdNext) {
      holdNext = false
      stats.held = true
      heldSearch = new Promise(resolve => { releaseSearch = () => { stats.held = false; resolve(snapshot) } })
      return heldSearch
    }
    return snapshot
  },
  act: async action => {
    if (action.type !== 'requestReview') throw new Error('Unexpected fixture action')
    stats.writes++
    detail = { ...detail, custom_keyed_values: { 'review-requested-ps': [...action.history, action.patchSet].join(',') } }
  },
  fixtureHoldSearch: () => { holdNext = true },
  fixtureReleaseSearch: () => releaseSearch(),
  fixtureCatchUp: () => { indexed = structuredClone(detail) },
  fixtureExternalVote: () => {
    detail = { ...detail, labels: { 'Code-Review': { all: [{ ...reviewer, value: 1 }] } }, updated: new Date(Date.now() + 1000).toISOString().replace('T', ' ').replace('Z', '') }
    indexed = structuredClone(detail)
  },
  fixtureStats: () => ({ ...stats }),
})
