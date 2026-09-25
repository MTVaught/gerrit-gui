// Writes the five dependency-chain mockups. Run: node docs/mockups/dependency-chains/gen.mjs
// All five show the same data: Alice's "Needs Review" tab, 1200px wide.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

// --- Data -------------------------------------------------------------------

const LABEL = { 'needs-review': 'Needs Review', approved: 'Approved', 'in-progress': 'In Progress', 'needs-changes': 'Needs Changes' }

/** Reviewers: [name, chip class, vote]. */
const chainA = {
  key: 'A',
  topic: 'settings-table',
  branch: 'master',
  project: 'demo',
  owner: 'Bob',
  members: [
    { n: 61, subject: 'Storage: add a migration runner', state: 'approved', ci: 'active', ps: 3, asked: true, rs: [['you', 'pos', '+1'], ['Carol', 'pos', '+1']], diff: ['+118', '−4'], age: '2d ago', tags: 2, action: 'open' },
    { n: 62, subject: 'Storage: migrate the settings table', state: 'needs-review', ci: 'active', ps: 2, asked: true, rs: [['you', 'pending'], ['Carol', 'pending']], diff: ['+64', '−12'], age: '3h ago', tags: 2, action: 'review' },
    { n: 63, subject: 'Settings: read the new table', state: 'needs-review', ci: 'wip', ps: 2, asked: true, rs: [['you', 'pending'], ['Carol', 'pos', '+1']], diff: ['+37', '−51'], age: '3h ago', tags: 1, action: 'review', outdated: '#62 PS 1' },
    { n: 64, subject: 'Settings: drop the legacy reader', state: 'in-progress', ci: 'wip', ps: 1, asked: false, rs: [['you', ''], ['Carol', '']], diff: ['+2', '−140'], age: '40m ago', tags: 0, action: 'open' },
  ],
}
const chainB = {
  key: 'B',
  topic: null,
  branch: 'release-2.1',
  project: 'demo',
  owner: 'Dave',
  members: [
    { n: 70, subject: 'CI: cache the pnpm store between jobs', state: 'needs-review', ci: 'active', ps: 1, asked: true, rs: [['you', 'pending'], ['Erin', 'pending']], diff: ['+25', '−3'], age: '1h ago', tags: 1, action: 'review' },
    { n: 71, subject: 'CI: split lint from typecheck', state: 'needs-review', ci: 'active', ps: 1, asked: true, rs: [['you', 'pending'], ['Erin', 'pending']], diff: ['+40', '−18'], age: '1h ago', tags: 1, action: 'review' },
  ],
}
const single = { n: 58, subject: 'Tray: show build info in the menu', state: 'needs-review', ci: 'wip', ps: 4, asked: true, rs: [['you', 'pending'], ['Bob', 'pos', '+1']], diff: ['+58', '−12'], age: '4h ago', tags: 1, action: 'review', branch: 'main', project: 'gerrit-gui', owner: 'Carol' }

/** The lowest change in the chain that still waits on you: the one to review first. */
const nextFor = (chain) => chain.members.find((m) => m.state === 'needs-review')
const needsYou = (chain) => chain.members.filter((m) => m.state === 'needs-review').length

// --- Pieces -----------------------------------------------------------------

const ICON = {
  fork: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="4" r="2.5"/><circle cx="6" cy="20" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 6.5v11"/><path d="M18 10.5c0 4-12 2-12 7"/></svg>',
  chain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="20" r="2.5"/><path d="M12 6.5v3M12 14.5v3"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  check: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
}

const topbar = () => `<header class="topbar"><nav class="tabs">
<span class="tab active">Needs Review <span class="count hot">5</span></span><span class="tab">Reviewing <span class="count">12</span></span><span class="tab">My Changes <span class="count split"><span class="neg">1</span><span class="pos">1</span></span></span><span class="tab">Merged <span class="count">1</span></span><span class="tab">Team Reviews <span class="count">15</span></span><span class="tab">External Reviews <span class="count">1</span></span>
</nav><div class="topbar-right"><span class="btn view-btn">⇅ View <span class="arrow">▾</span></span><span class="btn icon">⟳</span><span class="btn icon">⤡</span><span class="btn icon">⚙</span></div></header>`

const tags = (n, state) => (n === 0 ? `<span class="tags"><span class="tagbtn ${state === 'in-progress' ? '' : 'missing'}">${ICON.tag} no tags</span></span>` : `<span class="tags"><span class="tagbtn">${ICON.tag} ${n}</span></span>`)

const chips = (rs) =>
  `<div class="reviewers">${rs.map(([name, cls, vote]) => `<span class="chip ${cls}">${name}${vote ? ` <b>${vote}</b>` : ''}</span>`).join('')}<span class="trailing"><span class="chip add">+</span></span></div>`

const action = (m) =>
  m.action === 'review'
    ? `<span class="split"><span class="btn primary split-main">Review PS ${m.ps} ↗</span><span class="btn primary split-caret">▾</span></span>`
    : `<span class="split"><span class="btn split-main">Open PS ${m.ps} ↗</span><span class="btn split-caret">▾</span></span>`

const badges = (m, extra = '') =>
  `<span class="badge ${m.state}">${LABEL[m.state]}</span>${extra}`

/** The ten cells of one change: the first cell is whatever the design wants there. */
function row(m, { first, cls = '', stateExtra = '', dim = false } = {}) {
  return `<div class="change-row ${cls}${dim ? ' closed' : ''}">
<span class="cell c-branch">${first}</span>
<span class="cell c-state">${badges(m, stateExtra)}</span>
<span class="cell c-ci"><span class="badge ${m.ci}">${m.ci === 'wip' ? 'WIP' : 'Active'}</span></span>
<span class="cell c-num"><span class="link">#${m.n}</span>${tags(m.tags, m.state)}</span>
<span class="cell c-ps"><span>PS ${m.ps}</span>${m.asked ? '<span class="req">asked</span>' : ''}</span>
<div class="cell c-reviewers">${chips(m.rs)}</div>
<span class="cell c-diff"><span><span class="ins">${m.diff[0]}</span> <span class="del">${m.diff[1]}</span></span>${m.unresolved ? `<span class="muted">${m.unresolved} unresolved</span>` : ''}</span>
<span class="cell c-updated muted">${m.age}</span>
<div class="cell c-actions actions">${action(m)}</div>
<div class="cell c-wip actions"></div>
</div>`
}

const branchCell = (branch) => `<span class="link"><code>${branch}</code></span>`
const origin = (project, owner) => `<span class="muted small origin">${project} · ${owner}</span>`

/** Today's card for one change on one branch. */
function plainCard(m, { branch, project, owner }, headExtra = '', cls = '') {
  return `<li class="change state-${m.state} ${cls}">
<div class="change-head"><span class="link subject">${m.subject}</span>${headExtra}${origin(project, owner)}</div>
${row(m, { first: branchCell(branch) })}
</li>`
}

const section = (title, count, body) => `<section class="group"><h3>${title} <span class="count">${count}</span></h3><ul class="changes">${body}</ul></section>`

function page(title, css, body, note) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="base.css"><link rel="stylesheet" href="mock.css"><style>
${css}
</style></head><body><div class="app">${topbar()}<main class="board"><div class="sections">${body}</div></main></div>
<div class="mock-note">${note}</div></body></html>`
}

const stale = (m) => (m.outdated ? `<span class="badge stale" title="Built on ${m.outdated}; that change has a newer patch set">on ${m.outdated}</span>` : '')

// --- 1. Chain card: one card per chain, one row per change, base first -------

function chainCard1(chain) {
  const next = nextFor(chain)
  const tally = {}
  for (const m of chain.members) tally[m.state] = (tally[m.state] ?? 0) + 1
  const rows = chain.members
    .map((m, i) => {
      const step = m.state === 'approved' ? `<span class="step done">${ICON.check}</span>` : m === next ? `<span class="step next">${i + 1}</span>` : `<span class="step">${i + 1}</span>`
      const first = `${step}<span class="link subj">${m.subject}</span>`
      return row(m, { first, stateExtra: stale(m), dim: m.state !== 'needs-review' })
    })
    .join('')
  return `<li class="change chain state-${next.state}">
<div class="change-head"><span class="badge chain">${ICON.chain} ${chain.members.length} in sequence</span>${chain.topic ? `<span class="link subject">${chain.topic}</span>` : `<span class="subject muted">no topic</span>`}<span class="badge branch">${chain.branch}</span>${Object.entries(tally).map(([s, c]) => `<span class="badge tally ${s}">${c} ${LABEL[s]}</span>`).join('')}<span class="muted small">review from the top down · <b>#${next.n}</b> is next for you</span>${origin(chain.project, chain.owner)}</div>
${rows}</li>`
}

const css1 = `
.chain .c-branch { max-width: 280px; overflow: hidden; }
.chain .c-branch .subj { overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.change-row.closed .c-branch .subj { font-weight: 500; }
.step { flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--border); color: var(--muted); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.step.next { background: var(--accent); border-color: var(--accent); color: #fff; }
.step.done { background: var(--pos-bg); border-color: transparent; color: var(--pos); }
.change-head .muted b { color: var(--fg); }
`

const body1 = section('Waiting on you', 5, [chainCard1(chainA), chainCard1(chainB), plainCard(single, single)].join(''))
const note1 = `<b>1 · Chain card.</b> Like the Change-Id family card, one card gathers the whole chain, one row per change, base at the top so the rows read in review order. The subject moves into the first column; the branch and the topic move to the head with a tally of states. Changes that do not wait on you (already voted, or review not asked) stay in the card, greyed, so the reader sees what is below and above the next one. The step circle marks the one to review next; a tick marks a step you have voted on. The tab still counts changes (5), not cards. "on #62 PS 1" flags a change built on a patch set that has since moved.`

// --- 2. Linked cards: each change keeps its card; chain members touch and share a gutter line

function linkedCards2(chain) {
  const next = nextFor(chain)
  const onTab = chain.members.filter((m) => m.state === 'needs-review')
  const cards = onTab
    .map((m, i) => {
      const idx = chain.members.indexOf(m)
      const below = chain.members[idx - 1]
      const above = chain.members[idx + 1]
      const dep = below
        ? `<span class="badge dep ${below.state === 'approved' ? 'ok' : ''}" title="Cannot merge before #${below.n}">↓ needs #${below.n}${below.state === 'approved' ? ' · approved' : below.state === 'needs-review' ? ' · you first' : ''}</span>`
        : ''
      const by = above ? `<span class="badge dep" title="#${above.n} is built on this change">↑ #${above.n} builds on this</span>` : ''
      const extra = `<span class="badge chain">${ICON.chain} ${idx + 1} of ${chain.members.length}</span>${dep}${by}${stale(m)}`
      return `<div class="change state-${m.state} member ${i === 0 ? 'first' : ''} ${i === onTab.length - 1 ? 'last' : ''} ${m === next ? 'next' : ''}"><span class="dot"></span>
<div class="change-head"><span class="link subject">${m.subject}</span>${extra}${origin(chain.project, chain.owner)}</div>
${row(m, { first: branchCell(chain.branch) })}</div>`
    })
    .join('')
  return `<li class="chainwrap"><span class="rail"></span>${cards}</li>`
}

const css2 = `
.chainwrap { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; position: relative; row-gap: 0; }
.chainwrap .change.member { border-radius: 0; }
.chainwrap .change.member.first { border-radius: 8px 8px 0 0; }
.chainwrap .change.member.last { border-radius: 0 0 8px 8px; }
.chainwrap .change.member + .change.member { border-top: none; }
/* A rail in the gutter, left of the cards, with a dot per card. */
.board { padding-left: 34px; }
.chainwrap .rail { position: absolute; left: -22px; top: 22px; bottom: 22px; border-left: 2px solid var(--border); }
.chainwrap .change .dot { position: absolute; left: -29px; top: 14px; width: 10px; height: 10px; border-radius: 50%; background: var(--bg); border: 2px solid var(--muted); }
.chainwrap .change.next .dot { background: var(--accent); border-color: var(--accent); }
.badge.dep { background: var(--panel); border: 1px solid var(--border); color: var(--muted); }
.badge.dep.ok { color: var(--pos); border-color: var(--pos-bg); background: var(--pos-bg); }
`

const body2 = section('Waiting on you', 5, [linkedCards2(chainA), linkedCards2(chainB), plainCard(single, single)].join(''))
const note2 = `<b>2 · Linked cards.</b> Nothing moves: every change keeps today's card and its own section. Members of one chain that are on the tab are sorted together, base first, and their cards join into one block with a rail in the gutter; the filled dot is the one to review next. The head line says where the change sits ("2 of 4"), what it needs below it ("↓ needs #61 · approved") and what is built on it ("↑ #63 builds on this"). Changes off the tab (#61 already voted on, #64 not asked) appear only as those pointers.`

// --- 3. Flat badge with a popover: today's cards, a chain badge, the list on click

function badgeCards3(chain, openOn) {
  return chain.members
    .filter((m) => m.state === 'needs-review')
    .map((m) => {
      const idx = chain.members.indexOf(m)
      const pop =
        m.n === openOn
          ? `<div class="menu chainpop"><h4>Chain on <code>${chain.branch}</code> · ${chain.owner}</h4>${chain.members
              .map(
                (x, i) =>
                  `<div class="popline ${x === m ? 'here' : ''} ${x.state !== 'needs-review' ? 'dim' : ''}"><span class="pn">${i + 1}</span><span class="link">#${x.n}</span><span class="ps">${x.subject}</span><span class="badge ${x.state}">${LABEL[x.state]}</span>${x.rs.find((r) => r[0] === 'you')?.[2] ? `<span class="chip pos">you ${x.rs.find((r) => r[0] === 'you')[2]}</span>` : x.state === 'needs-review' ? '<span class="chip pending">you</span>' : ''}${x === m ? '<span class="muted small">this change</span>' : ''}</div>`,
              )
              .join('')}<div class="popfoot muted small">Review from 1 up. Gerrit submits each change only after the ones below it.</div></div>`
          : ''
      const extra = `<span class="chainbadge"><span class="badge chain ${m.n === openOn ? 'open' : ''}">${ICON.chain} ${idx + 1} of ${chain.members.length} ▾</span>${pop}</span>${stale(m)}`
      return plainCard(m, chain, extra)
    })
    .join('')
}

const css3 = `
.chainbadge { position: relative; display: inline-flex; }
.badge.chain.open { border-color: var(--muted); }
.menu.chainpop { position: absolute; left: 0; top: calc(100% + 6px); width: 520px; padding: 8px; }
.menu.chainpop h4 { margin: 0 4px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 700; }
.popline { display: flex; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 5px; font-size: 13px; white-space: nowrap; }
.popline.here { background: var(--panel); }
.popline.dim { color: var(--muted); }
.popline .pn { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--border); font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; color: var(--muted); flex: 0 0 auto; }
.popline.here .pn { background: var(--accent); border-color: var(--accent); color: #fff; }
.popline .ps { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.popfoot { margin: 6px 6px 2px; white-space: normal; }
`

const body3 = section('Waiting on you', 5, [badgeCards3(chainA, 62), badgeCards3(chainB, null), plainCard(single, single)].join(''))
const note3 = `<b>3 · Badge and popover.</b> The smallest change: today's cards, today's order, plus a "2 of 4" badge in the head of every change that has a parent or a child. Clicking the badge opens the chain as a list, base first, with each change's state and your vote on it; the current change is tinted. The chain is only visible on demand, so the board looks as it does now, but the reader has to open a popover to learn that #63 should wait for #62.`

// --- 4. Stack group: a header inside the section, member cards nested under it

function stackGroup4(chain) {
  const next = nextFor(chain)
  const cards = chain.members
    .map((m, i) => {
      const dim = m.state !== 'needs-review'
      const step = m.state === 'approved' ? `<span class="step done">${ICON.check}</span>` : m === next ? `<span class="step next">${i + 1}</span>` : `<span class="step">${i + 1}</span>`
      return `<li class="change state-${m.state} ${dim ? 'dimcard' : ''}"><span class="gutter">${step}</span>
<div class="change-head"><span class="link subject">${m.subject}</span>${stale(m)}${dim ? `<span class="muted small">${m.state === 'approved' ? 'you voted +1' : 'review not requested'}</span>` : ''}</div>
${row(m, { first: branchCell(chain.branch), dim })}</li>`
    })
    .join('')
  return `<li class="stack"><div class="stack-head"><span class="badge chain">${ICON.chain} chain</span><span class="stack-title">${chain.topic ? `topic <code>${chain.topic}</code>` : `#${chain.members[0].n} to #${chain.members.at(-1).n}`}</span><span class="badge branch">${chain.branch}</span><span class="muted small">${chain.members.length} changes · <b>${needsYou(chain)} wait on you</b> · next is #${next.n}</span><span class="muted small origin">${chain.project} · ${chain.owner}</span></div><ul class="changes nested">${cards}</ul></li>`
}

const css4 = `
.stack { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; border: 1px solid var(--band-border); border-radius: 8px; background: var(--band); overflow: hidden; }
.stack-head { grid-column: 1 / -1; display: flex; gap: 10px; align-items: baseline; padding: 7px 14px 7px 12px; background: var(--band-head); border-bottom: 1px solid var(--band-border); font-size: 13px; }
.stack-head .stack-title { font-weight: 600; font-size: 14px; }
.stack-head .origin { margin-left: auto; }
.stack-head .muted b { color: var(--fg); }
.changes.nested { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; row-gap: 0; padding: 8px 8px 8px 34px; }
.changes.nested .change { position: relative; background: var(--bg); }
.changes.nested .change + .change { margin-top: 6px; }
.changes.nested .change.dimcard { background: transparent; border-style: dashed; }
.changes.nested .change.dimcard .subject { color: var(--muted); font-weight: 500; }
.gutter { position: absolute; left: -28px; top: 10px; }
.step { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--band-border); background: var(--bg); color: var(--muted); font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.step.next { background: var(--accent); border-color: var(--accent); color: #fff; }
.step.done { background: var(--pos-bg); border-color: transparent; color: var(--pos); }
.changes.nested .change + .change .gutter::before { content: ''; position: absolute; left: 9px; top: -28px; height: 22px; border-left: 2px solid var(--band-border); }
`

const body4 = section('Waiting on you', 5, [stackGroup4(chainA), stackGroup4(chainB), plainCard(single, single)].join(''))
const note4 = `<b>4 · Stack group.</b> The chain is a tinted box inside the section, as a family is in the compact ledger: a header names the topic, the branch, how many changes wait on you and which is next; under it every member is an ordinary card, base first, numbered in the gutter with a line joining the steps. Members that do not wait on you are drawn dashed and greyed but keep their place, so the sequence is never broken. Each card keeps its full head line, so subjects never fight the branch column, at the cost of the tallest board of the five.`

// --- 5. Next up: one card per chain, only the change to review now, the rest as a stepper

function nextUp5(chain) {
  const next = nextFor(chain)
  const idx = chain.members.indexOf(next)
  const stepper = `<span class="stepper">${chain.members
    .map((m, i) => {
      const cls = m.state === 'approved' ? 'done' : m === next ? 'next' : m.state === 'needs-review' ? 'todo' : 'off'
      return `<span class="st ${cls}" title="#${m.n} ${m.subject}">${cls === 'done' ? ICON.check : i + 1}</span>`
    })
    .join('<span class="stl"></span>')}</span>`
  const after = chain.members.slice(idx + 1)
  const before = chain.members.slice(0, idx)
  const foot = `<div class="chain-foot">${before.length ? `<span class="fl"><span class="k">Built on</span>${before.map((m) => `<span class="fi"><span class="link">#${m.n}</span> ${m.subject} <span class="chip pos">you +1</span></span>`).join('')}</span>` : ''}${after.length ? `<span class="fl"><span class="k">Then</span>${after.map((m) => `<span class="fi"><span class="link">#${m.n}</span> ${m.subject}${m.state === 'needs-review' ? ` <span class="badge needs-review">Needs Review</span>` : ` <span class="badge in-progress">not asked yet</span>`}${stale(m)}</span>`).join('')}</span>` : ''}</div>`
  return `<li class="change state-${next.state} nextup">
<div class="change-head"><span class="link subject">${next.subject}</span><span class="badge chain">${ICON.chain} step ${idx + 1} of ${chain.members.length}</span>${stepper}${stale(next)}${origin(chain.project, chain.owner)}</div>
${row(next, { first: branchCell(chain.branch) })}
${foot}</li>`
}

const css5 = `
.stepper { display: inline-flex; align-items: center; gap: 0; vertical-align: middle; }
.st { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--border); color: var(--muted); font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.st.next { background: var(--accent); border-color: var(--accent); color: #fff; }
.st.done { background: var(--pos-bg); border-color: transparent; color: var(--pos); }
.st.todo { border-color: var(--pending); color: var(--pending); }
.st.off { border-style: dashed; }
.stl { width: 10px; border-top: 1.5px solid var(--border); }
.chain-foot { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 4px; padding-top: 6px; border-top: 1px dashed var(--border); font-size: 12.5px; color: var(--muted); }
.chain-foot .fl { display: inline-flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.chain-foot .k { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.chain-foot .fi { display: inline-flex; gap: 5px; align-items: center; white-space: nowrap; }
.chain-foot .link { font-weight: 600; color: var(--fg); }
.chain-foot .chip, .chain-foot .badge { font-size: 11px; padding: 1px 7px; }
`

const body5 = section('Waiting on you', 5, [nextUp5(chainA), nextUp5(chainB), plainCard(single, single)].join(''))
const note5 = `<b>5 · Next up.</b> A chain shows one card: the lowest change that still waits on you, drawn exactly as a single change is today. A stepper in the head says where it sits in the chain (tick: you voted; blue: this one; outlined: still to come; dashed: not asked yet). A footer names what it is built on and what comes after, each with its state. When you vote on this change, the card is replaced by the next one. The board is as short as it is now, and the reader is never offered #63 before #62; the cost is that #63 and #71 are not on the tab as cards, so the count "5" counts changes but only 3 cards are shown.`

// --- Write -----------------------------------------------------------------

const pages = [
  ['1-chain-card', '1 Chain card', css1, body1, note1],
  ['2-linked-cards', '2 Linked cards', css2, body2, note2],
  ['3-badge-popover', '3 Badge and popover', css3, body3, note3],
  ['4-stack-group', '4 Stack group', css4, body4, note4],
  ['5-next-up', '5 Next up', css5, body5, note5],
]
for (const [file, title, css, body, note] of pages) {
  writeFileSync(path.join(here, `${file}.html`), page(title, css, body, note))
  console.log('wrote', file + '.html')
}
