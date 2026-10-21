// Simulated Gerrit data for the native sequence workflow test.
const self = { _account_id: 1, username: 'alex', name: 'Alex Rivera', email: 'alex@example.com' }
const owner = { _account_id: 2, username: 'sam', name: 'Sam Chen', email: 'sam@example.com' }
const other = { _account_id: 3, username: 'jordan', name: 'Jordan Lee', email: 'jordan@example.com' }
const timestamp = '2026-10-13 12:00:00.000000000'
const settings = { serverUrl: 'https://gerrit.example.com', username: 'alex', projects: [], teams: [], primaryTeam: '', mergers: [], badgeStyle: 'color', showZeroCounts: false, showAppBadge: false, showTrayCounts: false, trayClickAction: 'menu', compactOnTop: true, slackWorkspaces: [], localReview: true, hasPassword: true, encrypted: true }
const make = (number, subject, person, reviewers, previous, requested = true, votes = {}) => ({ id: `demo~main~I${number}`, change_id: `I${number}`, _number: number, project: 'demo', branch: 'main', topic: person === self ? 'Settings migration' : 'Bounded telemetry batches', subject, status: 'NEW', owner: person, created: timestamp, updated: timestamp, insertions: 8, deletions: 2, hashtags: ['sequence', ...reviewers.map(r=>`reviewer:${r.username}`)], custom_keyed_values: requested ? { 'review-requested-ps': '1' } : {}, reviewers: { REVIEWER: reviewers }, labels: { 'Code-Review': { all: reviewers.map(r=>({...r, value:votes[r._account_id] ?? 0})) } }, current_revision: `sha${number}`, revisions: { [`sha${number}`]: { _number: 1, created: timestamp, commit: { subject, message: subject, parents: [{commit: previous ? `sha${previous}` : 'tip'}] } } } })
let changes
function reset() { changes = [make(101, 'Bound the telemetry batch size', owner, [self, other]), make(102, 'Flush batches on timeout', owner, [self, other], 101), make(103, 'Add delivery metrics', owner, [self, other], 102, true, {1:1,3:1}), make(201, 'Add the settings table', self, [owner], null, false), make(202, 'Read settings from the new table', self, [owner], 201), make(203, 'Remove the legacy settings reader', self, [owner], 202, true, {2:1})] }
reset()
const handlers = {
 getSettings: () => settings, lookupAccounts: () => [], getPretend: () => null,
 fetchDashboard: () => ({self, open: changes, merged: [], fetchedAt: new Date().toISOString(), truncated: false}),
 fetchChange: id => changes.find(c=>c._number===id),
 reviewPatchSets: () => [1], reviewReviewedFiles: () => [], reviewCommentPositions: () => [],
 reviewFiles: () => ({'src/batches.ts': {lines_inserted:1,lines_deleted:1}}),
 reviewDiff: (_, path) => ({meta_a:{name:path},meta_b:{name:path},content:[{ab:['// Telemetry batch limits']},{a:['export const batchLimit = 500;'],b:['export const batchLimit = 100;']},{ab:[''] }]}),
 reviewDiscussion: id => { const c=changes.find(c=>c._number===id); return {comments:[],drafts:[],self,owner:c.owner,permittedLabels:{'Code-Review':['-1','0','+1']},labels:{'Code-Review':{...c.labels['Code-Review'],values:{'-1':'Needs changes','0':'No score','+1':'Looks good'}}},latestPatchSet:1,reviewers:c.reviewers,attention:{},readOnly:false,canDeletePublished:false} },
 submitReview: (link,input) => { const c=changes.find(c=>c._number===link.id); for (const [label,value] of Object.entries(input.labels)) c.labels[label].all.find(r=>r._account_id===1).value=value; c.updated='2026-10-13 12:01:00.000000000' },
 suggestReviewers: () => [], act: a => {const c=changes.find(c=>c._number===a.id); if(a.type==='requestReview')c.custom_keyed_values['review-requested-ps']='1'},
}
const { contextBridge } = require('electron')
const noOp = async () => undefined
const subscribe = () => () => undefined
contextBridge.exposeInMainWorld('api', {
 ...Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, async (...args) => handler(...args)])),
 getUi: async () => ({ compact: process.env.SEQUENCE_COMPACT === '1' }),
 getUpdateState: async () => ({status:'idle',currentVersion:'0.1.0',availableVersion:null,downloadedVersion:null,releaseNotes:null,releaseUrl:null,downloadPercent:null,checkedAt:null,message:null,errorContext:null}),
 onUpdateState:subscribe,onCompactChanged:subscribe,onSettingsChanged:subscribe,onRefreshRequested:subscribe,onTabRequested:subscribe,onConnectionChanged:subscribe,
 onNativeReviewRequested:subscribe,setNativeReviewReady:()=>{},acknowledgeNativeReview:()=>{},
 setBadge:noOp,openChange:noOp,openUrl:noOp,
})
