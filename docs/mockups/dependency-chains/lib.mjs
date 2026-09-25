// Shared pieces for the sequence mockups: Bob's "My Changes" tab at 1200px, a chain of four on master, one other change.


export const LABEL = { 'needs-review': 'Needs Review', approved: 'Approved', 'in-progress': 'In Progress', 'needs-changes': 'Needs Changes' }

export const chain = {
  topic: 'settings-table',
  branch: 'master',
  project: 'demo',
  members: [
    { n: 61, subject: 'Storage: add a migration runner', state: 'approved', ci: 'active', ps: 3, asked: true, rs: [['Alice', 'pos', '+1'], ['Carol', 'pos', '+1']], diff: ['+118', '−4'], age: '2d ago', tags: 2, main: 'ready', wip: 'Mark WIP' },
    { n: 62, subject: 'Storage: migrate the settings table', state: 'needs-review', ci: 'active', ps: 2, asked: true, rs: [['Alice', 'pending'], ['Carol', 'pending']], diff: ['+64', '−12'], age: '3h ago', tags: 2, main: 'withdraw', wip: 'Mark WIP' },
    { n: 63, subject: 'Settings: read the new table', state: 'needs-review', ci: 'wip', ps: 2, asked: true, rs: [['Alice', 'pending'], ['Carol', 'pos', '+1']], diff: ['+37', '−51'], age: '3h ago', tags: 1, main: 'withdraw', wip: 'Mark active' },
    { n: 64, subject: 'Settings: drop the legacy reader', state: 'in-progress', ci: 'wip', ps: 1, asked: false, rs: [['Alice', ''], ['Carol', '']], diff: ['+2', '−140'], age: '40m ago', tags: 0, main: 'request', wip: 'Mark active' },
  ],
}
export const single = { n: 58, subject: 'Tray: show build info in the menu', state: 'needs-review', ci: 'wip', ps: 4, asked: true, rs: [['Alice', 'pending'], ['Carol', 'pos', '+1']], diff: ['+58', '−12'], age: '4h ago', tags: 1, main: 'withdraw', wip: 'Mark active', branch: 'main', project: 'gerrit-gui' }

export const ICON = {
  chain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="20" r="2.5"/><path d="M12 6.5v3M12 14.5v3"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></svg>',
  check: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
}

export const topbar = () => `<header class="topbar"><nav class="tabs">
<span class="tab">Needs Review <span class="count">1</span></span><span class="tab">Reviewing <span class="count">2</span></span><span class="tab active">My Changes <span class="count split"><span class="pos">1</span><span>4</span></span></span><span class="tab">Merged <span class="count">1</span></span><span class="tab">Team Reviews <span class="count">2</span></span><span class="tab">External Reviews <span class="count">0</span></span>
</nav><div class="topbar-right"><span class="btn view-btn">⇅ View <span class="arrow">▾</span></span><span class="btn icon">⟳</span><span class="btn icon">⤡</span><span class="btn icon">⚙</span></div></header>`

export const tags = (n, state) => (n === 0 ? `<span class="tags"><span class="tagbtn ${state === 'in-progress' ? '' : 'missing'}">${ICON.tag} no tags</span></span>` : `<span class="tags"><span class="tagbtn">${ICON.tag} ${n}</span></span>`)
export const chips = (rs) => `<div class="reviewers">${rs.map(([name, cls, vote]) => `<span class="chip ${cls}">${name}${vote ? ` <b>${vote}</b>` : ''}</span>`).join('')}<span class="trailing"><span class="chip add">+</span></span></div>`

export const MAIN = {
  ready: '<span class="split picker-wrap"><span class="btn primary split-main">Ready to Merge</span><span class="btn primary split-caret">▾</span></span>',
  withdraw: '<span class="btn">Withdraw request</span>',
  request: '<span class="split"><span class="btn primary split-main">Request (PS 1)</span><span class="btn primary split-caret">▾</span></span>',
}

/** The owner's subtle flags button, optionally drawn open with an extra item. */
export function flags(m, { open = false, extra = '' } = {}) {
  const menu = open
    ? `<div class="menu flags here" role="menu"><span class="menu-item"><span>${m.wip}</span><span class="muted">${m.wip === 'Mark WIP' ? 'stops CI' : 'runs CI'}</span></span><span class="menu-item"><span>Make private</span><span class="muted">hide from others</span></span>${extra}</div>`
    : ''
  return `<div class="split flags-menu" style="position:relative"><span class="btn subtle split-main ${open ? 'open' : ''}" ${open ? 'aria-expanded="true"' : ''}>${m.wip}</span><span class="btn subtle split-caret" ${open ? 'aria-expanded="true"' : ''}>▾</span>${menu}</div>`
}

export function row(m, { first, dim = false, wipCell, mainCell } = {}) {
  return `<div class="change-row${dim ? ' closed' : ''}">
<span class="cell c-branch">${first}</span>
<span class="cell c-state"><span class="badge ${m.state}">${LABEL[m.state]}</span></span>
<span class="cell c-ci"><span class="badge ${m.ci}">${m.ci === 'wip' ? 'WIP' : 'Active'}</span></span>
<span class="cell c-num"><span class="link">#${m.n}</span><span class="ps muted">PS ${m.ps}${m.ci === 'active' ? ' <span class="ci-mark pos">✓</span>' : ''}</span></span>
<span class="cell c-tags">${tags(m.tags, m.state)}</span>
<div class="cell c-reviewers">${chips(m.rs)}</div>
<span class="cell c-diff"><span><span class="ins">${m.diff[0]}</span> <span class="del">${m.diff[1]}</span></span></span>
<span class="cell c-updated muted">${m.age}</span>
<div class="cell c-wip actions">${wipCell ?? flags(m)}</div>
<div class="cell c-actions actions"><div class="btns">${mainCell ?? MAIN[m.main]}</div></div>
</div>`
}

export const branchCell = (b) => `<span class="link"><code>${b}</code></span>`
export const origin = (project) => `<span class="muted small origin">${project} · you</span>`

export function card(m, { branch, project }, { headExtra = '', wipCell, mainCell, cls = '' } = {}) {
  return `<li class="change state-${m.state} ${cls}">
<div class="change-head"><span class="link subject">${m.subject}</span>${headExtra}${origin(project)}</div>
${row(m, { first: branchCell(branch), wipCell, mainCell })}
</li>`
}

/** Design 1 from the parent folder: one card, one row per change, base first. */
export function chainCard(headExtra = '') {
  const tally = {}
  for (const m of chain.members) tally[m.state] = (tally[m.state] ?? 0) + 1
  const rows = chain.members
    .map((m, i) => {
      const step = m.state === 'approved' ? `<span class="step done">${ICON.check}</span>` : `<span class="step">${i + 1}</span>`
      return row(m, { first: `${step}<span class="link subj">${m.subject}</span>` })
    })
    .join('')
  return `<li class="change chain state-needs-review">
<div class="change-head"><span class="badge chain">${ICON.chain} 4 in sequence</span><span class="link subject">${chain.topic}</span><span class="badge branch">${chain.branch}</span>${Object.entries(tally).map(([s, c]) => `<span class="badge tally ${s}">${c} ${LABEL[s]}</span>`).join('')}${headExtra}${origin(chain.project)}</div>
${rows}</li>`
}

export const section = (title, count, body, hint = '') => `<section class="group"><h3>${title} <span class="count">${count}</span></h3>${hint}<ul class="changes">${body}</ul></section>`

export function page(title, css, body, note) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="base.css"><link rel="stylesheet" href="mock.css"><style>
${css}
</style></head><body><div class="app">${topbar()}<main class="board"><div class="sections">${body}</div></main></div>
<div class="mock-note">${note}</div></body></html>`
}

/** Bob's tab as it is today: every change in its own section. */
export const todayCards = (decorate = () => ({})) => {
  const by = (n) => chain.members.find((m) => m.n === n)
  return [
    section('Approved', 1, card(by(61), chain, decorate(by(61)))),
    section('Out for review', 3, [card(by(62), chain, decorate(by(62))), card(by(63), chain, decorate(by(63))), card(single, single, decorate(single))].join('')),
    section('In progress, review not requested', 1, card(by(64), chain, decorate(by(64)))),
  ].join('')
}

