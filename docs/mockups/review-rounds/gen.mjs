// Writes the five pages. Run: node docs/mockups/review-rounds/gen.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Sample data. `rounds` lists every patch set the owner asked to have reviewed,
// oldest first; `votes` are the primary reviewers' Code-Review votes per patch
// set. A round is "reviewed" once any primary reviewer voted on that patch set.
// A change is "iterating" once any round is reviewed.
// ---------------------------------------------------------------------------
const mine = [
  { n: 31, subject: 'Add retry to upload client', branch: 'master', ps: 1, rounds: [1], votes: {}, reviewers: ['Carol', 'Dave'], ins: 84, del: 12, age: '20m', unresolved: 0 },
  { n: 27, subject: 'Fix flaky scheduler test', branch: 'master', ps: 5, rounds: [2, 4, 5], votes: { 2: { Carol: -1 }, 4: { Carol: -1, Dave: 1 } }, reviewers: ['Carol', 'Dave'], ins: 23, del: 9, age: '1h', unresolved: 2 },
  { n: 22, subject: 'Add Prometheus exporter', branch: 'master', ps: 4, rounds: [4], votes: { 4: { Carol: 1, Dave: -1 } }, reviewers: ['Carol', 'Dave'], ins: 210, del: 3, age: '3h', unresolved: 4 },
  { n: 8, subject: 'Rename Storage helpers', branch: 'master', ps: 3, rounds: [1, 3], votes: { 1: { Carol: -1 }, 3: { Carol: 1, Dave: 1 } }, reviewers: ['Carol', 'Dave'], ins: 41, del: 41, age: '1d', unresolved: 0 },
  { n: 19, subject: 'Migrate config to TOML', branch: 'release-2.4', ps: 3, rounds: [1, 2], votes: { 2: { Carol: -1 } }, reviewers: ['Carol'], ins: 310, del: 198, age: '2d', unresolved: 1 },
  { n: 40, subject: 'Cap cache sizes', branch: 'master', ps: 2, rounds: [1], votes: {}, reviewers: ['Carol', 'Dave'], ins: 12, del: 4, age: '2d', unresolved: 0 },
  { n: 12, subject: 'Bump build dependencies', branch: 'master', ps: 1, rounds: [], votes: {}, reviewers: ['Carol'], ins: 6, del: 6, age: '3d', unresolved: 0 },
]
const theirs = [
  { n: 55, subject: 'Trim log noise in the scheduler', owner: 'Alice', branch: 'master', ps: 2, rounds: [2], votes: {}, reviewers: ['you', 'Carol'], ins: 14, del: 30, age: '40m', unresolved: 0 },
  { n: 48, subject: 'Retry on 5xx from the artifact store', owner: 'Alice', branch: 'master', ps: 6, rounds: [3, 5, 6], votes: { 3: { you: -1, Carol: -1 }, 5: { you: 1, Carol: -1 } }, reviewers: ['you', 'Carol'], ins: 66, del: 20, age: '2h', unresolved: 1 },
]

const current = (c) => c.rounds.includes(c.ps)
const reviewedRounds = (c) => c.rounds.filter((ps) => Object.keys(c.votes[ps] ?? {}).length > 0)
const iterating = (c) => reviewedRounds(c).length > 0
const round = (c) => c.rounds.length
const voteOn = (c, ps, who) => c.votes[ps]?.[who] ?? 0
function state(c) {
  const v = c.votes[c.ps] ?? {}
  const all = c.reviewers.every((r) => v[r])
  if (all && Object.values(v).some((x) => x < 0)) return 'needs-changes'
  if (all) return 'approved'
  return current(c) ? 'needs-review' : 'in-progress'
}
const LABEL = { 'in-progress': 'In Progress', 'needs-review': 'Needs Review', 'needs-changes': 'Needs Changes', approved: 'Approved' }
const fmt = (v) => (v > 0 ? `+${v}` : String(v))
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || (n % 100 >= 11 && n % 100 <= 13) ? 0 : n % 10]}`
/** Only the first request may be withdrawn: one round, on this patch set, nobody voted. */
const canWithdraw = (c) => state(c) === 'needs-review' && c.rounds.length === 1 && !iterating(c)

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function chips(c, self) {
  return c.reviewers
    .map((r) => {
      const v = voteOn(c, c.ps, r)
      const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : current(c) ? 'pending' : ''
      const past = c.rounds.filter((ps) => ps !== c.ps && voteOn(c, ps, r)).map((ps) => `${fmt(voteOn(c, ps, r))} on PS ${ps}`)
      const title = past.length ? `earlier: ${past.join(', ')}` : ''
      return `<span class="chip ${cls}" title="${title}">${r === self ? 'you' : r}${v ? ` <b>${fmt(v)}</b>` : ''}</span>`
    })
    .join('')
}
function actions(c, opts = {}) {
  const s = state(c)
  const out = []
  if (opts.reviewer) {
    const last = [...c.rounds].reverse().find((ps) => ps !== c.ps && voteOn(c, ps, 'you'))
    out.push(`<button class="btn primary">${last ? `Review PS ${last} → ${c.ps}` : `Review PS ${c.ps}`}<span class="ext"> ↗</span></button>`)
    return out.join('')
  }
  if (s === 'in-progress') {
    const again = iterating(c)
    out.push(`<button class="btn primary" title="${again ? 'Ask every primary reviewer to look at this patch set again' : 'Ask every primary reviewer to look at this patch set'}">${again ? 'Re-request' : 'Request'} review (PS ${c.ps})</button>`)
  }
  if (canWithdraw(c)) out.push(`<button class="btn" title="Nobody has looked yet, so the request can be taken back entirely">Withdraw request</button>`)
  if (s === 'needs-review' && !canWithdraw(c) && opts.noWithdrawNote) out.push(`<span class="muted small" title="Reviewed on PS ${reviewedRounds(c).join(', ')}; a request that was answered stays on record">reviewed before</span>`)
  if (s === 'approved') out.push(`<button class="btn primary">Ready to Merge ▾</button>`)
  return out.join('')
}
function row(c, v) {
  const s = state(c)
  const self = v.reviewer ? 'you' : undefined
  return `<div class="change-row">
<span class="cell c-branch"><span class="link"><code>${c.branch}</code></span></span>
<span class="cell c-state">${v.stateCell(c, s)}</span>
<span class="cell c-ci"><span class="badge active">Active</span></span>
<span class="cell c-num"><span class="link">#${c.n}</span></span>
<span class="cell c-ps">${v.psCell(c, s)}</span>
<div class="cell c-reviewers"><div class="reviewers">${chips(c, self)}</div></div>
<span class="cell c-diff"><span><span class="ins">+${c.ins}</span> <span class="del">−${c.del}</span></span>${c.unresolved ? `<span class="muted">${c.unresolved} unresolved</span>` : ''}</span>
<span class="cell c-updated muted">${c.age}</span>
<div class="cell c-actions actions">${actions(c, { reviewer: v.reviewer, noWithdrawNote: v.noWithdrawNote })}</div>
<div class="cell c-wip actions">${v.reviewer ? '' : '<button class="btn subtle">Mark WIP</button>'}</div>
</div>`
}
function card(c, v) {
  return `<li class="change state-${state(c)}"><div class="change-head"><span class="link subject">${c.subject}</span><span class="muted small origin">demo · ${c.owner ?? 'you'}</span></div>${row(c, v)}</li>`
}
function group(title, items, v, hint) {
  if (items.length === 0) return ''
  return `<div class="group"><h3>${title}</h3>${hint ? `<p class="muted small">${hint}</p>` : ''}<ul class="changes">${items.map((c) => card(c, v)).join('')}</ul></div>`
}
function topbar(active) {
  const tabs = [
    ['Needs Review', '<span class="count hot">2</span>'],
    ['Reviewing', '<span class="count">3</span>'],
    ['My Changes', '<span class="count split"><span class="neg">1</span><span class="pos">1</span><span>7</span></span>'],
    ['Merged', '<span class="count">7</span>'],
    ['Team Reviews', '<span class="count">4</span>'],
  ]
  return `<header class="topbar"><nav class="tabs">${tabs.map(([t, n]) => `<button class="tab${t === active ? ' active' : ''}">${t} ${n}</button>`).join('')}</nav><div class="topbar-right"><span class="muted small">updated just now</span><button class="btn">View ▾</button><button class="btn icon">⟳</button><button class="btn icon">⚙</button></div></header>`
}
/** What Gerrit shows for #27 under each storage shape. */
function shape(title, tags, keyed, why) {
  return `<div class="shape"><div class="shape-title">${title}</div>
<div class="shape-row"><span class="k">Hashtags</span><span>${tags.length ? tags.map((t) => `<span class="tag">${t}</span>`).join('') : '<span class="muted">none</span>'}</span></div>
<div class="shape-row"><span class="k">Custom keyed values</span><span>${keyed.length ? keyed.map(([k, val]) => `<code>${k}</code> = <code>${val}</code>`).join('<br>') : '<span class="muted">none</span>'}</span></div>
<div class="shape-why muted small">${why}</div></div>`
}
const stdSections = (v) => {
  const by = (s) => mine.filter((c) => state(c) === s)
  return [
    group('Needs Changes', by('needs-changes'), v),
    group('Approved', by('approved'), v),
    group('Out for review', by('needs-review'), v),
    group('In Progress, review not requested', by('in-progress'), v),
  ].join('')
}
function page(name, title, note, shapeHtml, mineHtml, foot) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Review rounds: ${name}</title><link rel="stylesheet" href="base.css"><link rel="stylesheet" href="mock.css"></head><body><div class="app">
<div class="note"><b>${title}.</b> ${note}</div>
${shapeHtml}
${topbar('My Changes')}
<div class="board"><div class="sections">${mineHtml}</div></div>
<div class="mock-note">${foot}</div>
</div></body></html>`
  writeFileSync(join(here, `${name}.html`), html)
}


const SAMPLE = '#27 is out for review on PS 5 after votes on PS 2 and 4; it sits with #31 in one section, since the review phase is not split. #19 got a −1 on PS 2 and PS 3 is up: iterating. #40 asked on PS 1, nobody voted, PS 2 is up: not reviewed. #31 alone may withdraw.'
const plainPs = (c) => `<span>PS ${c.ps}</span>${current(c) ? '<span class="req">asked</span>' : c.rounds.length ? `<span class="req stale">asked PS ${c.rounds.at(-1)}</span>` : ''}`
const plainState = (c, s) => `<span class="badge ${s}">${LABEL[s]}</span>`
const top = (v) => [group('Needs Changes', mine.filter((c) => state(c) === 'needs-changes'), v), group('Approved', mine.filter((c) => state(c) === 'approved'), v), group('Out for review', mine.filter((c) => state(c) === 'needs-review'), v)].join('')
const ip = (it) => mine.filter((c) => state(c) === 'in-progress' && iterating(c) === it)
const inProgress = (c) => state(c) === 'in-progress'

// 1. Split sections; keyed list
{
  const v = { stateCell: plainState, psCell: plainPs }
  page('1-split-sections', '1 · Two In Progress sections, list in the keyed value',
    'Out for review is one section as today. In Progress splits: changes pushed after a review sit above changes nobody has reviewed. Nothing on the row changes.',
    shape('Storage: append to the existing keyed value', [], [['review-requested-ps', '2,4,5']], 'Each request appends the patch set; the last entry is the open request when it equals the current patch set. Owner and admins only, as today. Not searchable in Gerrit.'),
    top(v) + group('In Progress, iterating after review', ip(true), v) + group('In Progress, not reviewed yet', ip(false), v),
    SAMPLE)
}
// 2. Badge on in-progress rows; hashtag per round
{
  const v = { stateCell: (c, s) => plainState(c, s) + (inProgress(c) && iterating(c) ? `<span class="badge iter" title="Reviewed on PS ${reviewedRounds(c).join(', ')}">after review</span>` : ''), psCell: plainPs }
  page('2-badge', '2 · "After review" badge, one hashtag per round',
    'One section for In Progress as today; rows that follow a review get an amber badge beside the state. No other row changes.',
    shape('Storage: a hashtag per asked patch set', ['review:ps2', 'review:ps4', 'review:ps5', 'reviewer:carol', 'reviewer:dave'], [], 'Searchable: <code>hashtag:review:ps5</code>. Anyone with Edit Hashtags can add one, like the reviewer tags. The keyed value goes away. Tags pile up on long-lived changes and show in Gerrit\'s hashtag row.'),
    top(v) + group('In Progress, review not requested', mine.filter(inProgress), v),
    SAMPLE)
}
// 3. Strip in the PS cell of in-progress rows; keyed value per round
{
  const strip = (c) => {
    if (!inProgress(c) || !c.rounds.length) return plainPs(c)
    const cells = c.rounds.map((ps) => {
      const votes = Object.values(c.votes[ps] ?? {})
      const cls = votes.length === 0 ? 'skipped' : votes.some((x) => x < 0) ? 'neg' : 'pos'
      const tip = votes.length === 0 ? 'asked, nobody voted before the next push' : `voted ${votes.map(fmt).join(' ')}`
      return `<span class="ps ${cls}" title="PS ${ps}: ${tip}">${ps}</span>`
    })
    cells.push(`<span class="ps now" title="PS ${c.ps}: current, review not requested">${c.ps}</span>`)
    return `<span class="strip">PS</span>${cells.join('<span class="sep">·</span>')}`
  }
  const v = { stateCell: plainState, psCell: strip }
  page('3-patch-set-strip', '3 · Patch-set strip on In Progress rows, one keyed value per round',
    'Only In Progress rows change: the PS cell lists the patch sets that were asked for review, red or green for the vote they got, hollow for asked but never voted on, then the current one in grey. Iterating is read off the colours.',
    shape('Storage: one keyed value per round', [], [['review-round-1', '2'], ['review-round-2', '4'], ['review-round-3', '5']], 'Round number in the key, patch set in the value; a new request writes the next key. Countable without parsing; a withdrawn round is deleted by key. Owner and admins only, not searchable.'),
    top(v) + group('In Progress, review not requested', mine.filter(inProgress), v),
    SAMPLE)
}
// 4. Words in the PS cell and the button; keyed list plus marker tag
{
  const v = {
    stateCell: plainState,
    psCell: (c) => inProgress(c) && c.rounds.length ? `<span>PS ${c.ps}</span><span class="req ${iterating(c) ? 'iter' : 'stale'}" title="${iterating(c) ? `Reviewed on PS ${reviewedRounds(c).join(', ')}` : 'Asked, but nobody voted before the next push'}">${iterating(c) ? `reviewed on PS ${reviewedRounds(c).at(-1)}` : `asked PS ${c.rounds.at(-1)}, unreviewed`}</span>` : plainPs(c),
  }
  page('4-words', '4 · Words in the PS cell, marker hashtag',
    'No badge, no new section. The PS cell of an In Progress row says "reviewed on PS 2" in the request colour, or "asked PS 1, unreviewed" in grey. The button already says Re-request only after a review.',
    shape('Storage: keyed list plus a marker hashtag', ['iterating', 'reviewer:carol', 'reviewer:dave'], [['review-requested-ps', '2,4,5']], 'The list is the source of truth, as in 1. The app also adds <code>iterating</code> the first time a request follows a vote, so <code>hashtag:iterating</code> works in Gerrit. Cleared on merge or abandon.'),
    top(v) + group('In Progress, review not requested', mine.filter(inProgress), v),
    SAMPLE)
}
// 5. State badge wording; round hashtag plus keyed list
{
  const v = {
    stateCell: (c, s) => inProgress(c) ? `<span class="badge ${s}" title="${iterating(c) ? `Reviewed on PS ${reviewedRounds(c).join(', ')}` : ''}">${iterating(c) ? 'Iterating' : 'In Progress'}</span>` : plainState(c, s),
    psCell: plainPs,
  }
  page('5-iterating-state', '5 · "Iterating" as the state, round-counter hashtag',
    'The In Progress badge reads "Iterating" once any round was reviewed, and the tab keeps two sections: Iterating above In Progress. This is the only page that adds a state, so the tab pill and the ledger could count it.',
    shape('Storage: round-counter hashtag plus the keyed list', ['review-round:3', 'reviewer:carol', 'reviewer:dave'], [['review-requested-ps', '2,4,5']], 'One <code>review-round:N</code> tag, replaced on each request, keyed like <code>merger:</code>. Searchable and readable in Gerrit; the keyed list keeps which patch sets the rounds were. Nothing piles up.'),
    top(v) + group('Iterating', ip(true), v) + group('In Progress', ip(false), v),
    SAMPLE)
}
