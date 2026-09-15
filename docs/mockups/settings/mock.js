// Shared data and row renderers for the filter/sort mockups. Every design shows
// Bob's "Reviewing" tab. Ages are hours; the three sort keys use created, ps
// (when the current patch set was pushed) and updated.
const HUE = { Bob: 'h0', Carol: 'h1', Alice: 'h2', Dave: 'h3', Erin: 'h4', Frank: 'h5', Grace: 'h1', Heidi: 'h3' }
const SECTIONS = [
  ['you', 'Waiting on you', 'needs-review'],
  ['others', 'Reviewed, waiting on others', 'needs-review'],
  ['changes', 'Needs changes', 'needs-changes'],
  ['approved', 'Approved', 'approved'],
]
// rev: [name, vote] with vote '+1' | '-1' | 'pend' | '' ; ext: outside the team
const CHANGES = [
  { n: 31, subj: 'Add retry to upload client', owner: 'Alice', ps: 5, created: 9 * 24, psAge: 2, updated: 0.33, wip: false, sec: 'you', ins: 84, del: 12, rev: [['Bob', 'pend'], ['Carol', '+1']] },
  { n: 45, subj: 'Fix tray icon on Linux', owner: 'Dave', ps: 2, created: 2 * 24, psAge: 26, updated: 3, wip: true, sec: 'you', ins: 31, del: 4, rev: [['Bob', 'pend'], ['Carol', 'pend']] },
  { n: 30, subj: 'Stabilize status pills on macOS', owner: 'Alice', ps: 3, created: 6 * 24, psAge: 3 * 24, updated: 1, wip: false, sec: 'you', ins: 58, del: 12, rev: [['Bob', 'pend'], ['Carol', '+1'], ['Dave', 'pend']] },
  { n: 38, subj: 'Rotate CA bundle before expiry', owner: 'Erin', ownerExt: true, ps: 1, created: 18, psAge: 18, updated: 18, wip: true, sec: 'you', ins: 0, del: 0, rev: [['Bob', 'pend'], ['Carol', 'pend']] },
  { n: 19, subj: 'Bump protobuf to 4.25.3', owner: 'Alice', ps: 1, created: 40, psAge: 40, updated: 40, wip: true, sec: 'you', ins: 6, del: 6, rev: [['Bob', 'pend'], ['Carol', 'pend']] },
  { n: 36, subj: 'Log a warning when the CA bundle is missing', owner: 'Alice', ps: 2, created: 5 * 24, psAge: 16, updated: 16, wip: true, sec: 'others', ins: 12, del: 3, rev: [['Bob', '+1'], ['Carol', 'pend']], ext: [['Erin', '+1']] },
  { n: 20, subj: 'Cache avatar lookups per session', owner: 'Dave', ps: 1, created: 3 * 24, psAge: 3 * 24, updated: 39, wip: false, sec: 'others', ins: 44, del: 9, rev: [['Bob', '+1'], ['Carol', 'pend']] },
  { n: 42, subj: 'Retry token refresh on 401', owner: 'Alice', ps: 1, created: 15, psAge: 15, updated: 15, wip: true, sec: 'changes', ins: 0, del: 0, rev: [['Bob', '+1'], ['Carol', '-1']] },
  { n: 28, subj: 'Drop legacy settings migration', owner: 'Frank', ps: 4, created: 12 * 24, psAge: 38, updated: 38, wip: false, sec: 'approved', ins: 12, del: 3, rev: [['Bob', '+1'], ['Carol', '+1']] },
]
const TOTAL = 25 // what the Reviewing tab count says; the rows above are the ones on screen

const SORT_LABEL = { updated: 'Most recent update', age: 'Overall age, oldest first', ps: 'Last patch set, oldest first' }
const SORT_SHORT = { updated: 'Updated', age: 'Oldest change', ps: 'Oldest patch set' }

function fmt(h) {
  if (h < 1) return Math.round(h * 60) + 'm'
  if (h < 48) return Math.round(h) + 'h'
  return Math.round(h / 24) + 'd'
}
function ownerName(c) { return c.ownerExt ? c.owner + ' (other team)' : c.owner }
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;') }
function hl(text, term) {
  if (!term) return esc(text)
  const i = text.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return esc(text)
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + term.length)) + '</mark>' + esc(text.slice(i + term.length))
}
function matches(c, o) {
  if (o.owner && c.owner !== o.owner) return false
  if (o.search && !c.subj.toLowerCase().includes(o.search.toLowerCase())) return false
  return true
}
function sortRows(rows, sort) {
  const r = rows.slice()
  if (sort === 'age') r.sort((a, b) => b.created - a.created || a.n - b.n)
  else if (sort === 'ps') r.sort((a, b) => b.psAge - a.psAge || a.n - b.n)
  else r.sort((a, b) => a.updated - b.updated || b.n - a.n)
  return r
}
function visible(o) { return CHANGES.filter((c) => matches(c, o)) }
function authorCounts(o) {
  // Counts for the author facet ignore the author filter itself, so the other authors stay pickable.
  const m = new Map()
  for (const c of CHANGES.filter((c) => matches(c, { ...o, owner: null }))) m.set(c.owner, (m.get(c.owner) ?? 0) + 1)
  return m
}
/** The age cell follows the sort key, so the order is legible. */
function ageText(c, sort, compact) {
  if (sort === 'age') return compact ? 'opened ' + fmt(c.created) : 'opened ' + fmt(c.created) + ' ago'
  if (sort === 'ps') return compact ? 'PS ' + fmt(c.psAge) : 'PS ' + c.ps + ' pushed ' + fmt(c.psAge) + ' ago'
  return compact ? fmt(c.updated) : fmt(c.updated) + ' ago'
}
function chipFor([name, vote], ext) {
  const cls = vote === '+1' ? 'pos' : vote === '-1' ? 'neg' : ext ? '' : 'pending'
  const label = name === 'Bob' ? 'you' : ext ? name + ' (other team)' : name
  return `<span class="chip ${ext ? 'ext ' : ''}${cls}">${label}${vote === '+1' || vote === '-1' ? ` <b>${vote.replace('-', '−')}</b>` : ''}</span>`
}
function avatar([name, vote]) {
  const me = name === 'Bob' ? ' you' : ''
  const v = vote === '+1' ? '<i class="v pos">+1</i>' : vote === '-1' ? '<i class="v neg">−1</i>' : vote === 'pend' ? '<i class="v pend"></i>' : ''
  return `<span class="av ${HUE[name] ?? 'h0'}${me}">${name[0]}${v}</span>`
}
function actionFull(c) {
  const primary = c.sec === 'you'
  const label = primary ? `Review PS ${c.ps}` : `Open PS ${c.ps}`
  const p = primary ? ' primary' : ''
  return `<span class="split"><button class="btn split-main${p}">${label} <span class="arrow">↗</span></button><button class="btn split-caret${p}">▾</button></span>`
}
function stateBadge(c) {
  const s = SECTIONS.find((x) => x[0] === c.sec)[2]
  const l = { 'needs-review': 'Needs Review', 'needs-changes': 'Needs Changes', approved: 'Approved' }[s]
  return `<span class="badge ${s}">${l}</span>`
}

/** Full-window board: sections of cards, the same markup as ChangeRow.tsx. */
function renderFull(el, o) {
  o = { sort: 'updated', owner: null, search: '', header: false, ...o }
  const rows = visible(o)
  let html = ''
  for (const [id, title, state] of SECTIONS) {
    const items = sortRows(rows.filter((c) => c.sec === id), o.sort)
    if (!items.length) continue
    html += `<section class="group"><h3>${title} <span class="count">${items.length}</span></h3><ul class="changes">`
    if (o.header) html += o.header(o)
    for (const c of items) {
      html += `<li class="change state-${state}"><div class="change-head"><button class="link subject">${hl(c.subj, o.search)}</button>` +
        `<span class="muted small origin">demo · ${o.ownerLink ? o.ownerLink(c) : ownerName(c)}</span></div>` +
        `<div class="change-row"><span class="cell c-branch"><code>master</code></span><span class="cell c-state">${stateBadge(c)}</span>` +
        `<span class="cell c-ci"><span class="badge ${c.wip ? 'wip' : 'active'}">${c.wip ? 'WIP' : 'Active'}</span></span>` +
        `<span class="cell c-num"><button class="link">#${c.n}</button></span><span class="cell c-ps"><span>PS ${c.ps}</span>${o.psExtra ? o.psExtra(c) : '<span class="req">asked</span>'}</span>` +
        `<div class="cell c-reviewers"><div class="reviewers">${c.rev.map((r) => chipFor(r, false)).join('')}</div>` +
        (c.ext ? `<div class="reviewers external">${c.ext.map((r) => chipFor(r, true)).join('')}</div>` : '') + `</div>` +
        `<span class="cell c-diff"><span><span class="ins">+${c.ins}</span> <span class="del">−${c.del}</span></span></span>` +
        (o.extraCells ? o.extraCells(c) : '') + `<span class="cell c-updated muted">${o.ageCell ? o.ageCell(c) : ageText(c, o.sort, false)}</span><div class="cell c-actions"><div class="actions">${actionFull(c)}</div></div></div></li>`
    }
    html += '</ul></section>'
  }
  if (!rows.length) html = `<div class="panel empty">${o.emptyText ?? 'No change matches.'}</div>`
  el.innerHTML = html
  return rows.length
}

/** Compact ledger, the markup of Ledger.tsx. */
function renderLedger(el, o) {
  o = { sort: 'updated', owner: null, search: '', thead: null, ...o }
  const rows = visible(o)
  let html = `<table class="ledger"><colgroup><col><col class="ci"><col class="rv"><col class="ac"></colgroup>` +
    (o.thead ?? `<thead><tr><th>Change</th><th>CI</th><th>Reviewers</th><th></th></tr></thead>`) + (o.afterHead ?? '')
  for (const [id, title, state] of SECTIONS) {
    const items = sortRows(rows.filter((c) => c.sec === id), o.sort)
    if (!items.length) continue
    html += `<tbody><tr class="g"><td colspan="4">${title} <span class="count">${items.length}</span></td></tr>`
    for (const c of items) {
      const sub = [`#${c.n}`, o.ownerLink ? o.ownerLink(c) : ownerName(c), `PS ${c.ps}`, `<span class="ins">+${c.ins}</span> <span class="del">−${c.del}</span>`, ageText(c, o.sort, true)]
      const act = c.sec === 'you' ? '<button class="btn sm primary">Review ↗</button>' : '<button class="btn sm">Open ↗</button>'
      html += `<tr class="lrow state-${state}"><td class="c"><button class="link t">${hl(c.subj, o.search)}</button><div class="s">${sub.join('<span class="sep">·</span>')}</div></td>` +
        `<td class="ci"><span class="badge ${c.wip ? 'wip' : 'active'}">${c.wip ? 'WIP' : 'Active'}</span></td>` +
        `<td class="r"><span class="stack">${c.rev.slice(0, 3).map(avatar).join('')}</span></td><td class="a">${act}</td></tr>`
    }
    html += '</tbody>'
  }
  html += '</table>'
  if (!rows.length) html = `<div class="panel empty">${o.emptyText ?? 'No change matches.'}</div>`
  el.innerHTML = html
  return rows.length
}

function tabsFull(active = 'Reviewing') {
  const t = [['Needs Review', 7, true], ['Reviewing', 25], ['My Changes', 2], ['Ready to Merge', 3], ['Recently Merged', 17], ['External Reviews', 1]]
  return `<nav class="tabs">${t.map(([l, n, hot]) => `<button class="tab${l === active ? ' active' : ''}">${l} <span class="count${hot ? ' hot' : ''}">${n}</span></button>`).join('')}</nav>`
}
function tabsCompact(active = 'Reviewing') {
  const t = [['To review', 7, true], ['Reviewing', 25], ['Mine', 2], ['Ready', 3], ['Merged', 17], ['External', 1]]
  return `<nav class="tabs">${t.map(([l, n, hot]) => `<button class="tab${l === active ? ' active' : ''}">${l} <span class="count${hot ? ' hot' : ''}">${n}</span></button>`).join('')}</nav>`
}
const ICONS = `<button class="btn icon" title="Refresh">⟳</button><button class="btn icon" title="Compact window">⤡</button><button class="btn icon" title="Settings">⚙</button>`
const ICONS_C = `<button class="btn icon" title="Refresh">⟳</button><button class="btn icon active" title="Expand">⤢</button><button class="btn icon" title="Settings">⚙</button>`

const MAG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
const FUNNEL = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>'
const SORTI = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/></svg>'
const SLIDERS = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>'
/** Replace <i class="i-mag"> etc. with inline SVG, so no emoji font is needed. */
function icons() {
  const m = { 'i-mag': MAG, 'i-funnel': FUNNEL, 'i-sort': SORTI, 'i-sliders': SLIDERS }
  for (const [k, v] of Object.entries(m)) document.querySelectorAll('.' + k).forEach((e) => (e.innerHTML = v))
}
