// Writes the five mockup pages. Each variant only changes the last cell of the
// row (and, for variant 4, the CI badge cell); everything else is shared.
import fs from 'node:fs'
const lock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
const unlock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>'
const privBadge = `<span class="badge private">${lock}Private</span>`

const rows = [
  { subject: 'S3 rename the storage helpers', branch: 'master', state: 'in-progress', label: 'In progress', wip: true, priv: false, num: 27, ps: 'PS 2', rev: '<span class="chip">Bob</span>', diff: ['+120', '−33'], age: '5m ago', req: '<button class="btn" disabled title="Ask every primary reviewer to look at this patch set">Request review</button>', focus: true },
  { subject: 'S4 drop the legacy TOML loader', branch: 'release-2.0', state: 'needs-review', label: 'Needs Review', wip: false, priv: false, num: 25, ps: 'PS 3<span class="req">asked</span>', rev: '<span class="chip pending">Carol</span><span class="chip pos">Dave <b>+1</b></span>', diff: ['+8', '−310'], age: '1h ago', req: '<button class="btn" title="Ask every primary reviewer to look at this patch set again">Request review</button>' },
  { subject: 'S5 bump build dependencies', branch: 'master', state: 'in-progress', label: 'In progress', wip: true, priv: false, num: 12, ps: 'PS 3<span class="req stale">asked PS 2</span>', rev: '<span class="chip">Bob</span><span class="chip">Carol</span>', diff: ['+6', '−6'], age: '3d ago', req: '<button class="btn">Request review</button>' },
]
const privRows = [
  { subject: 'S6 spike: streaming uploads', branch: 'master', state: 'in-progress', label: 'In progress', wip: true, priv: true, num: 31, ps: 'PS 1', rev: '', diff: ['+412', '−9'], age: '20m ago', req: '<button class="btn" disabled>Request review</button>' },
]

function row(r, v) {
  const ci = v.ciCell ? v.ciCell(r) : `<span class="badge ${r.wip ? 'wip' : 'active'}">${r.wip ? 'WIP' : 'Active'}</span>`
  return `<li class="change state-${r.state}">
<div class="change-head"><button class="link subject">${r.subject}</button><span class="muted small">demo · you</span></div>
<div class="change-row">
<span class="cell c-branch"><button class="link"><code>${r.branch}</code></button></span>
<span class="cell c-state"><span class="badge ${r.state}">${r.label}</span>${r.priv && !v.noPrivBadge ? privBadge : ''}</span>
<span class="cell c-ci">${ci}</span>
<span class="cell c-num"><button class="link">#${r.num}</button></span>
<span class="cell c-ps"><span>${r.ps}</span></span>
<div class="cell c-reviewers"><div class="reviewers">${r.rev}<span class="trailing"><button class="chip add">+</button></span></div></div>
<span class="cell c-diff"><span><span class="ins">${r.diff[0]}</span> <span class="del">${r.diff[1]}</span></span></span>
<span class="cell c-updated muted">${r.age}</span>
<span class="cell c-actions">${r.req}</span>
<span class="cell c-wip actions">${v.wipCell(r)}</span>
</div></li>`
}

function page(v) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Private toggle mockup</title>
<link rel="stylesheet" href="base.css"><link rel="stylesheet" href="mock.css">${v.style ? `<style>${v.style}</style>` : ''}</head>
<body><div class="app">
<div class="topbar"><div class="tabs">
<button class="tab">Needs Review <span class="count hot">1</span></button><button class="tab">Reviewing <span class="count">2</span></button><button class="tab active">My Changes <span class="count">19</span></button><button class="tab">Ready to Merge <span class="count">0</span></button><button class="tab">Recently Merged <span class="count">1</span></button><button class="tab">Team Reviews <span class="count">2</span></button><button class="tab">External Reviews <span class="count">0</span></button>
</div><div class="topbar-right"><span class="muted status-line">Alice · updated just now</span><button class="btn view-btn">View <span class="arrow">▾</span></button><button class="btn icon">⟳</button><button class="btn icon">⚙</button></div></div>
<div class="board">
<p class="muted small">Signed in as Alice. Push as many patch sets as you like; reviewers are only asked to look when you press Request review, and only for that patch set. Private changes are listed last, in a section of their own.</p>
<div class="sections">
<div class="group"><h3>Out for review <span class="count">7</span></h3><ul class="changes">
${rows.map((r) => row(r, v)).join('\n')}
</ul></div>
<div class="group"><h3>Private <span class="count">1</span></h3><ul class="changes">
${privRows.map((r) => row(r, v)).join('\n')}
</ul></div>
<div class="spacer" style="height:${v.spacer ?? 40}px"></div>
</div></div>
<p class="mock-note">${v.note}</p>
</div></body></html>`
}

const variants = {
  '1-dropdown': {
    wipCell: (r) => {
      const label = r.wip ? 'Mark active' : 'Mark WIP'
      if (!r.focus) return `<button class="btn subtle">${label} <span class="arrow">▾</span></button>`
      return `<button class="btn subtle open" aria-expanded="true">${label} <span class="arrow">▾</span></button>
<div class="menu mock" role="menu">
<button class="menu-item"><span>Mark active</span><span class="muted">runs CI</span></button>
<button class="menu-item"><span>Make private</span><span class="muted">hides it from others</span></button>
</div>`
    },
    note: '<b>1 · Dropdown.</b> The subtle button keeps its label but gains a caret and opens a small menu: the WIP toggle first, the visibility toggle under it. A private change reads "Make public". One control, two actions, nothing else changes on the row. Costs one extra click for the common WIP toggle.',
    spacer: 40,
  },
  '2-split-button': {
    wipCell: (r) => {
      const label = r.wip ? 'Mark active' : 'Mark WIP'
      const main = `<span class="split subtle-split${r.focus ? ' open' : ''}"><button class="btn subtle split-main">${label}</button><button class="btn subtle split-caret" aria-expanded="${!!r.focus}">▾</button></span>`
      if (!r.focus) return main
      return `${main}<div class="menu mock" role="menu">
<button class="menu-item"><span>Make private</span><span class="muted">hides it from others</span></button>
</div>`
    },
    note: '<b>2 · Split button.</b> The main part still toggles WIP in one click, like today. Only the caret opens a menu, and the menu holds the rarer visibility toggle ("Make public" on a private change). Same shape as the reviewer\'s Review split button, so nothing new to learn. The caret is small, so the private action is easy to miss.',
    spacer: 20,
  },
  '3-two-buttons': {
    wipCell: (r) => {
      const label = r.wip ? 'Mark active' : 'Mark WIP'
      const vis = r.priv ? 'Make public' : 'Make private'
      return `<button class="btn subtle">${label}</button><button class="btn subtle" title="${r.priv ? 'Let everyone with access to the project see this change' : 'Hide this change from everyone but the owner, the reviewers and the CCs'}">${vis}</button>`
    },
    note: '<b>3 · Two buttons.</b> A second subtle button next to the first: "Make private" on an ordinary change, "Make public" on a private one. Both actions stay one click away and the row has no menus. The last column grows by roughly 80px, so the reviewers column gets narrower.',
    spacer: 0,
  },
  '4-clickable-badges': {
    noPrivBadge: true,
    ciCell: (r) => {
      const wip = `<button class="badge toggle ${r.wip ? 'wip' : 'active'}" title="${r.wip ? 'Click to mark active (runs CI)' : 'Click to mark WIP (stops CI)'}">${r.wip ? 'WIP' : 'Active'}</button>`
      const vis = r.priv
        ? `<button class="badge toggle private" title="Click to make public">${lock}Private</button>`
        : `<button class="badge toggle public${r.focus ? ' hot' : ''}" title="Click to make private">${unlock}Public</button>`
      return `${wip}${vis}${r.focus ? '<div class="tip">Make private: hide it from everyone not on the change</div>' : ''}`
    },
    wipCell: () => '',
    style: '.c-ci { gap: 4px; } .badge.toggle { font: inherit; font-size: 11px; } .changes { --wip-col: 0px; }',
    note: '<b>4 · Clickable badges.</b> The WIP/Active badge and a new Public/Private badge in the same column are the toggles; clicking flips them, the tooltip says what happens. The action buttons column goes away, freeing width for reviewers. State and control live in one place, but a badge does not look clickable at first, hence the dotted underline.',
    spacer: 30,
  },
  '5-kebab-menu': {
    wipCell: (r) => {
      const btn = `<button class="btn subtle icon${r.focus ? ' open' : ''}" title="More" aria-expanded="${!!r.focus}">⋯</button>`
      if (!r.focus) return btn
      return `${btn}<div class="menu mock" role="menu">
<button class="menu-item selected"><span>Work in progress</span><span class="muted">CI paused</span></button>
<button class="menu-item"><span>Private</span><span class="muted">only people on it can see it</span></button>
<hr>
<button class="menu-item"><span>Open in Gerrit</span></button>
</div>`
    },
    note: '<b>5 · Overflow menu.</b> The button becomes a "⋯" that opens a checklist: Work in progress and Private are checkable flags, ticked when on, so the menu shows state as well as changing it. There is room to add more owner actions later (Open in Gerrit, Abandon). Narrowest column of the five, but the WIP toggle is now two clicks and hidden behind an icon.',
    spacer: 60,
  },
}
for (const [name, v] of Object.entries(variants)) fs.writeFileSync(new URL(`./${name}.html`, import.meta.url), page(v))
