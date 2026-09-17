// Writes the five mockup pages: each shows the full window on top and the
// compact window underneath, so one image covers both layouts.
import fs from 'node:fs'

const fork = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="4" r="2"/><circle cx="18" cy="4" r="2"/><circle cx="12" cy="20" r="2"/><path d="M6 6v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V6M12 12v6"/></svg>'
const bugIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7a3 3 0 0 1 6 0"/><rect x="7" y="7" width="10" height="13" rx="5"/><path d="M3 13h4M17 13h4M4 20l3-2M20 20l-3-2M4 6l3 2M20 6l-3 2"/></svg>'
const checkIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>'
const linkIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>'
const tagIco = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor"/></svg>'

// Trailer keys nobody wants on a board; every variant but 5 hides them.
const NOISE = new Set(['Change-Id', 'Signed-off-by'])
const ID = 'I7c3e2f1a9b4d0e6f5a1c2b3d4e5f60718293a4b5'

const changes = [
  {
    key: 's3', subject: 'Add retries to the S3 uploader', branch: 'master', state: 'needs-review', label: 'Needs Review', wip: false, num: 4127, ps: 'PS 3<span class="req">asked</span>',
    rev: '<span class="chip pending">Carol</span><span class="chip pos">Dave <b>+1</b></span>', avs: '<span class="av h3">C<i class="v pend"></i></span><span class="av h1">D<i class="v pos">+1</i></span>', diff: ['+212', '−40'], age: '1h ago', act: '<button class="btn primary">Review ↗</button>', short: '<button class="btn sm primary">Review ↗</button>',
    body: 'Uploads over a flaky link gave up on the first 5xx. Retry three\ntimes with jitter, and log the final failure with the request id.',
    trailers: [['Bug', '4821'], ['Test', 'unit; manual against minio'], ['Depends-On', ID], ['Change-Id', 'I2f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e']],
  },
  {
    key: 's4', subject: 'Drop the legacy TOML loader', branch: 'release-2.0', state: 'approved', label: 'Approved', wip: false, num: 4102, ps: 'PS 5',
    rev: '<span class="chip pos">Bob <b>+2</b></span>', avs: '<span class="av h0">B<i class="v pos">+2</i></span>', diff: ['+8', '−310'], age: '3h ago', act: '<button class="btn">Submit</button>', short: '<button class="btn sm">Submit</button>',
    body: 'Nothing has shipped a TOML config since 1.4.',
    trailers: [['Bug', '3390'], ['Bug', '3391'], ['Test', 'pytest'], ['Signed-off-by', 'Alice Example <alice@example.com>'], ['Change-Id', 'Iab12cd34ef56ab12cd34ef56ab12cd34ef56ab12']],
  },
  {
    key: 's5', subject: 'Bump build dependencies', branch: 'master', state: 'in-progress', label: 'In progress', wip: true, num: 4088, ps: 'PS 1',
    rev: '<span class="chip">Bob</span>', avs: '<span class="av h0">B</span>', diff: ['+61', '−61'], age: '2d ago', act: '<button class="btn" disabled>Request review</button>', short: '<button class="btn sm more">···</button>',
    body: 'Routine bump. No behaviour change expected.',
    trailers: [['Test', 'none'], ['Relates-To', '4102'], ['Cq-Include-Trybots', 'luci.chromium.try:win-rel,mac-rel'], ['Change-Id', 'I99887766554433221100ffeeddccbbaa99887766']],
  },
]
const family = {
  key: 'I5f5f', subject: 'Fix crash on an empty config file', trailers: [['Bug', '5120'], ['Test', 'manual: start with 0-byte config'], ['Change-Id', 'I5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f']],
  body: 'read_config() indexed the first line before checking there was one.',
  members: [
    { branch: 'master', state: 'merged', label: 'Merged 2d ago', closed: true, num: 4051, ps: 'PS 2', rev: '<span class="chip pos">Bob <b>+2</b></span>', avs: '<span class="av h0">B<i class="v pos">+2</i></span>', diff: ['+4', '−1'], age: '2d ago', act: '', short: '' },
    { branch: 'release-2.0', state: 'needs-review', label: 'Needs Review', num: 4130, ps: 'PS 1<span class="req">asked</span>', rev: '<span class="chip pending">Bob</span>', avs: '<span class="av h0">B<i class="v pend"></i></span>', diff: ['+4', '−1'], age: '40m ago', act: '<button class="btn primary">Review ↗</button>', short: '<button class="btn sm primary">Review ↗</button>' },
  ],
}

const shown = (t) => t.filter(([k]) => !NOISE.has(k))
const short = (v) => (v.length > 14 && /^I[0-9a-f]{40}$/.test(v) ? v.slice(0, 10) + '…' : v)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

// ---- full window --------------------------------------------------------

function fullRow(r, v, opts = {}) {
  const closed = r.closed ? ' closed' : ''
  const cells = [
    `<span class="cell c-branch"><button class="link"><code>${r.branch}</code></button></span>`,
    `<span class="cell c-state"><span class="badge ${r.state}">${r.label}</span>${v.stateExtra ? v.stateExtra(opts.trailers, r) : ''}</span>`,
    `<span class="cell c-ci">${r.closed ? '' : `<span class="badge ${r.wip ? 'wip' : 'active'}">${r.wip ? 'WIP' : 'Active'}</span>`}</span>`,
    `<span class="cell c-num"><button class="link">#${r.num}</button>${v.numExtra ? v.numExtra(opts.trailers, r) : ''}</span>`,
    `<span class="cell c-ps"><span>${r.ps}</span></span>`,
  ]
  if (v.rowCell) cells.push(v.rowCell(opts.trailers, r))
  cells.push(
    `<div class="cell c-reviewers"><div class="reviewers">${r.rev}${r.closed ? '' : '<span class="trailing"><button class="chip add">+</button></span>'}</div></div>`,
    `<span class="cell c-diff"><span><span class="ins">${r.diff[0]}</span> <span class="del">${r.diff[1]}</span></span></span>`,
    `<span class="cell c-updated muted">${r.age}</span>`,
    `<span class="cell c-actions actions">${r.act}</span>`,
    `<span class="cell c-wip actions">${r.closed || !r.wip ? '' : '<button class="btn subtle">Mark active (runs CI)</button>'}</span>`,
  )
  return `<div class="change-row${closed}">${cells.join('\n')}</div>`
}

function card(c, v) {
  const head = v.head ? v.head(c.trailers, c) : ''
  const after = v.afterHead ? v.afterHead(c.trailers, c) : ''
  const right = v.headRight ? `<span class="head-right">${v.headRight(c.trailers, c)}</span>` : ''
  const foot = v.afterRows ? v.afterRows(c.trailers, c) : ''
  return `<li class="change state-${c.state}${v.selected === c.key ? ' selected' : ''}">
<div class="change-head"><button class="link subject">${c.subject}</button>${v.headInline ? v.headInline(c.trailers, c) : ''}<span class="muted small origin">demo · Alice</span>${head}${right}</div>${after}
${fullRow(c, v, { trailers: c.trailers })}${foot}</li>`
}

function familyCard(f, v) {
  const lead = f.members[1]
  const head = v.head ? v.head(f.trailers, f) : ''
  const after = v.afterHead ? v.afterHead(f.trailers, f) : ''
  const right = v.headRight ? `<span class="head-right">${v.headRight(f.trailers, f)}</span>` : ''
  const foot = v.afterRows ? v.afterRows(f.trailers, f) : ''
  return `<li class="change family state-${lead.state}">
<div class="change-head"><button class="link subject">${f.subject}</button>${v.headInline ? v.headInline(f.trailers, f) : ''}<span class="badge branch">${fork} 2 branches</span><span class="badge tally merged">1 Merged</span><span class="badge tally needs-review">1 Needs Review</span><span class="muted small origin">demo · Alice</span>${head}${right}</div>${after}
${f.members.map((m) => fullRow(m, v, { trailers: f.trailers, member: true })).join('\n')}${foot}</li>`
}

// ---- compact window -----------------------------------------------------

function lrow(c, v, o = {}) {
  const t = o.trailers ?? c.trailers
  const subParts = [`#${c.num}`, ...(v.subExtra ? v.subExtra(t, c) : []), c.age, 'Alice', c.ps.replace(/<span.*$/, ''), `<span class="ins">${c.diff[0]}</span> <span class="del">${c.diff[1]}</span>`]
  let sub = subParts.map((p, i) => (i ? '<span class="sep">·</span>' : '') + p).join('')
  if (v.subRight) sub = `<span class="sl">${sub}</span><span class="sr">${v.subRight(t, c)}</span>`
  const title = o.member ? `<button class="link t"><code>${c.branch}</code></button>` : `<button class="link t">${c.subject}</button>`
  const mem = o.member ? ` mem${c.closed ? ' closed' : ''}${o.last && !o.open ? ' end' : ''}` : ''
  const line = v.rowLine ? v.rowLine(t, c) : ''
  let html = `<tr class="lrow state-${c.state}${o.open ? ' open' : ''}${mem}">
<td class="c">${title}<div class="s">${sub}</div>${line}</td>
<td class="ci">${c.closed ? '' : `<span class="badge ${c.wip ? 'wip' : 'active'}">${c.wip ? 'WIP' : 'Active'}</span>`}</td>
<td class="r"><span class="stack">${c.avs}</span></td>
<td class="a">${c.short}</td></tr>`
  if (v.rowAfter) html += v.rowAfter(t, c, o)
  if (o.open) {
    html += `<tr class="ldetail${o.member ? ` mem${o.last ? ' end' : ''}` : ''}"><td colspan="4">
<div class="ldet-badges"><span class="badge ${c.state}">${c.label}</span>${v.detailBadges ? v.detailBadges(t, c) : ''}<span class="muted">demo · ${c.branch} · review requested for PS 3</span></div>
${v.detail ? v.detail(t, c) : ''}
<div class="reviewers">${c.rev}<span class="trailing"><button class="chip add">+</button></span></div>
<div class="ldet-actions"><button class="btn sm">Open in Gerrit ↗</button></div>
</td></tr>`
  }
  return html
}

function compact(v) {
  const [s3, s4, s5] = changes
  return `<div class="mock-frame"><p class="lbl">Compact window · 440px</p><div class="win compact"><div class="board"><table class="ledger">
<colgroup><col><col class="ci"><col class="rv"><col class="ac"></colgroup>
<thead><tr><th>Change</th><th>CI</th><th>Reviewers</th><th aria-label="Action"></th></tr></thead>
<tbody>
<tr class="g"><td colspan="4">Waiting on you <span class="count">2</span></td></tr>
${lrow(s3, v, { open: !v.noOpen })}
<tr class="fsp"><td colspan="4"></td></tr>
<tr class="fh"><td colspan="4"><span class="t">${fork}<span class="txt">${family.subject}</span></span><span class="n muted">2 branches</span>${v.fhead ? v.fhead(family.trailers) : ''}</td></tr>
${family.members.map((m, i) => lrow(m, v, { member: true, last: i === 1, trailers: family.trailers })).join('\n')}
<tr class="fsp"><td colspan="4"></td></tr>
<tr class="g"><td colspan="4">Reviewed, waiting on others <span class="count">2</span></td></tr>
${lrow(s4, v)}
${lrow(s5, v)}
</tbody></table></div>${v.frameOverlay ? v.frameOverlay() : ''}</div></div>`
}

function page(v) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Commit tags mockup</title>
<link rel="stylesheet" href="base.css"><link rel="stylesheet" href="mock.css"></head>
<body class="${v.cls ?? ''}"><div class="app">
<div class="topbar"><div class="tabs">
<button class="tab">Needs Review <span class="count hot">2</span></button><button class="tab active">Reviewing <span class="count">4</span></button><button class="tab">My Changes <span class="count">3</span></button><button class="tab">Ready to Merge <span class="count">0</span></button><button class="tab">Recently Merged <span class="count">1</span></button><button class="tab">Team Reviews <span class="count">2</span></button><button class="tab">External Reviews <span class="count">0</span></button>
</div><div class="topbar-right"><span class="muted status-line">Bob · updated just now</span><button class="btn view-btn">View <span class="arrow">▾</span></button><button class="btn icon">⟳</button><button class="btn icon">⚙</button></div></div>
<div class="board${v.pane ? ' with-pane' : ''}"><div class="sections">
<div class="group"><h3>Waiting on you <span class="count">2</span></h3><ul class="changes">
${card(changes[0], v)}
${familyCard(family, v)}
</ul></div>
<div class="group"><h3>Reviewed, waiting on others <span class="count">2</span></h3><ul class="changes">
${card(changes[1], v)}
${card(changes[2], v)}
</ul></div>
</div>${v.pane ? v.pane() : ''}</div>
<div class="mock-split">${compact(v)}</div><p class="mock-note">${v.note}</p>
</div></body></html>`
}

// ---- the five ideas -----------------------------------------------------

const tagChip = (k, val) => `<span class="tag" title="${esc(k)}: ${esc(val)}"><span class="k">${esc(k)}</span>${esc(short(val))}</span>`
const kv = (k, val) => `<span class="k">${esc(k)}:</span> ${esc(short(val))}`

const semantic = (k, val, { dot = false } = {}) => {
  const txt = dot ? '' : esc(short(val))
  if (k === 'Bug' || k === 'Relates-To') return `<span class="pill bug${dot ? ' dot' : ''}" title="${k} ${esc(val)}: opens the tracker">${bugIco}${dot ? '' : (k === 'Bug' ? '' : 'rel ') + txt}</span>`
  if (k === 'Test') return `<span class="pill test${val === 'none' ? ' none' : ''}${dot ? ' dot' : ''}" title="Test: ${esc(val)}">${checkIco}${txt}</span>`
  if (k === 'Depends-On') return `<span class="pill dep${dot ? ' dot' : ''}" title="Depends on ${esc(val)}: opens that change">${linkIco}${txt}</span>`
  return `<span class="pill other${dot ? ' dot' : ''}" title="${esc(k)}: ${esc(val)}">${tagIco}${dot ? '' : `${esc(k)} ${txt}`}</span>`
}

const footer = (c, t, { noise = true } = {}) =>
  `<div class="footer-block"><div class="body">${esc(c.body)}</div>${t
    .map(([k, val]) => (NOISE.has(k) ? (noise ? `<span class="noise">${esc(k)}: ${esc(val)}</span>` : null) : `<span class="k">${esc(k)}:</span> ${esc(val)}`))
    .filter(Boolean)
    .join('\n')}</div>`

const variants = {
  '1-chips': {
    head: (t) => `<span class="tags">${shown(t).map(([k, v]) => tagChip(k, v)).join('')}</span>`,
    rowLine: (t) => `<div class="tags">${shown(t).map(([k, v]) => tagChip(k, v)).join('')}</div>`,
    note: '<b>1 · Chips under the subject.</b> Every trailer becomes a small key/value chip on a line of its own inside the card head, above the branch rows, so a family shows them once. Key in small caps, value beside it, Change-Ids shortened; the full value is in the tooltip. <b>Compact:</b> the same chips as a third line under the meta line, smaller, wrapping as needed. Scannable at a glance, but adds a line to every row in the ledger, which the compact window can least afford.',
  },
  '2-line': {
    head: (t) => `<span class="trailer-line">${shown(t).map(([k, v]) => kv(k, v)).join('<span class="sep">·</span>')}</span>`,
    subExtra: (t) => shown(t).filter(([k]) => k === 'Bug' || k === 'Depends-On').map(([k, v]) => kv(k, v)),
    detail: (t) => `<div class="ldet-trailers">${shown(t).map(([k, v]) => kv(k, v)).join('<span class="sep"> · </span>')}</div>`,
    note: '<b>2 · One muted line, as in the commit.</b> The trailers are printed the way git shows them, <code>Key: value</code>, monospace, on one muted line under the subject, dot separated, truncated with an ellipsis if the card is narrow. No new UI element, nothing to learn, cheap to implement. <b>Compact:</b> the row stays two lines: Bug and Depends-On join the existing meta line right after the number, and the full set is printed in the detail row when the change is opened. Test and the rest wait for the detail row, since the meta line is already clipped at this width.',
  },
  '3-column': {
    cls: 'v3',
    rowCell: (t) => {
      const s = shown(t)
      const top = s.slice(0, 2).map(([k, v]) => `<span class="tl" title="${esc(k)}: ${esc(v)}"><span class="k">${esc(k)}</span> ${esc(short(v))}</span>`).join('')
      const more = s.length > 2 ? `<span class="more" title="${s.slice(2).map(([k, v]) => `${k}: ${v}`).join('\n')}">+${s.length - 2} more</span>` : ''
      return `<span class="cell c-tags">${top}${more}</span>`
    },
    rowLine: (t) => (shown(t).length ? `<span class="tcount" title="${shown(t).map(([k, v]) => `${k}: ${v}`).join('\n')}">${tagIco} ${shown(t).length}</span>` : ''),
    detail: (t) => `<table class="ldet-table">${shown(t).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${k === 'Bug' || k === 'Depends-On' ? `<a href="#">${esc(v)}</a>` : esc(v)}</td></tr>`).join('')}</table>`,
    note: '<b>3 · A column of its own.</b> A new Tags column between the patch set and the reviewers, aligned across every card on the tab like the other columns. The first two trailers are listed, key muted, value plain, one per line; the rest are behind "+N more". A family repeats them per branch, which is right when the cherry-pick carries different trailers. <b>Compact:</b> the ledger has no room for a column, so the row shows only a count pill in the title cell; opening the row shows a key/value table, with Bug and Depends-On as links. Widest of the five on the full window.',
  },
  '4-pills': {
    headInline: (t) => {
      const s = shown(t)
      const hot = s.filter(([k]) => ['Bug', 'Test', 'Depends-On', 'Relates-To'].includes(k))
      const rest = s.length - hot.length
      return `<span class="pills">${hot.map(([k, v]) => semantic(k, v)).join('')}${rest ? `<span class="pill rest" title="${s.filter(([k]) => !['Bug', 'Test', 'Depends-On', 'Relates-To'].includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n')}">+${rest} other</span>` : ''}</span>`
    },
    subExtra: (t) => {
      const s = shown(t).filter(([k]) => ['Bug', 'Test', 'Depends-On', 'Relates-To'].includes(k))
      return s.length ? [`<span class="pills" style="margin:0;vertical-align:-3px">${s.map(([k, v]) => semantic(k, v, { dot: true })).join('')}</span>`] : []
    },
    detail: (t) => `<div class="pills" style="margin-top:6px">${shown(t).map(([k, v]) => semantic(k, v)).join('')}</div>`,
    note: '<b>4 · Semantic pills.</b> Known trailers get a colour and an icon and sit on the subject line: Bug is red and opens the tracker, Test is green (amber when it says none), Depends-On is blue and opens that change; anything else is a grey pill, or folded into "+N other". The value alone, no key, since the icon says which it is. <b>Compact:</b> the same pills shrink to icon-only dots after the number on the meta line, with the value in the tooltip, and appear in full in the detail row. Richest reading and the only one that makes the trailers clickable, but it needs a per-key config (which keys, which colour, what URL a bug number opens), and unknown keys look second-class.',
  },
  '5-disclosure': {
    headInline: (t, c) => `<button class="disc${c.key === 's3' ? ' open' : ''}"><span class="tri">${c.key === 's3' ? '▼' : '▶'}</span>${shown(t).length} tags</button>`,
    afterHead: (t, c) => (c.key === 's3' ? footer(c, t) : ''),
    subExtra: (t) => [`<button class="disc"><span class="tri">▶</span>${shown(t).length} tags</button>`],
    detail: (t, c) => footer(c, t),
    note: '<b>5 · Disclosure of the message footer.</b> Nothing new on the card by default but a small "N tags" toggle after the subject. Opening it unfolds the commit message inside the card: body in grey, trailers below it as written, with Change-Id and Signed-off-by faded rather than hidden. The row of cells is untouched. <b>Compact:</b> the toggle sits after the number on the meta line; the footer is printed in the detail row when the change is opened, where it already shows the badges and reviewers. Least noise for people who rarely need the tags, and the only idea that also shows the message body; but the tags are never visible without a click, and the block is a different height per change.',
  },
}


const tagsOf = (t, keys) => shown(t).filter(([k]) => keys.includes(k))
const bugBadge = ([k, val]) =>
  k === 'Depends-On'
    ? `<span class="badge dep" title="Depends on ${esc(val)}: opens that change">${linkIco}${esc(short(val))}</span>`
    : `<span class="badge bug" title="${k}: ${esc(val)}. Opens the tracker">${k === 'Relates-To' ? 'rel ' : 'bug '}${esc(val)}</span>`
const paneBody = (c, t, cls = '') => `<div class="pane-body ${cls}">
<div class="pane-title">${esc(c.subject)}</div>
<div class="pane-sub muted">#4127 · demo · master · PS 3 · Alice</div>
<div class="ldet-badges"><span class="badge needs-review">Needs Review</span><span class="badge active">Active</span></div>
<h5>Commit message</h5>
<div class="pane-msg">${esc(c.body)}</div>
<h5>Tags</h5>
<table class="ldet-table">${t.map(([k, v]) => `<tr class="${NOISE.has(k) ? 'noise' : ''}"><td class="k">${esc(k)}</td><td class="v">${k === 'Bug' || k === 'Depends-On' ? `<a href="#">${esc(v)}</a>` : esc(v)}</td></tr>`).join('')}</table>
<div class="ldet-actions"><button class="btn sm">Open in Gerrit ↗</button></div>
</div>`

const NOTAG = new Set([4051, 4130, 4088])
Object.assign(variants, {
  '6-right': {
    cls: 'v6',
    headRight: (t) => `<span class="rt">${shown(t).map(([k, v]) => `<span class="rt-i" title="${esc(k)}: ${esc(v)}"><span class="k">${esc(k)}</span> ${esc(short(v))}</span>`).join('')}</span>`,
    subRight: (t) => tagsOf(t, ['Bug', 'Depends-On', 'Relates-To']).map(([k, v]) => `<span class="k">${esc(k)}</span> ${esc(short(v))}`).join('<span class="sep">·</span>'),
    detail: (t) => `<div class="ldet-trailers">${shown(t).map(([k, v]) => kv(k, v)).join('<span class="sep"> · </span>')}</div>`,
    note: '<b>6 · Right-aligned on the title line.</b> The subject stays on the left and the trailers sit at the far right of the same line, above the buttons, as small muted text with the key in bold. The left of the card is what the change is; the right is what it is tied to. Nothing is added below the title, so the card keeps its height. <b>Compact:</b> the meta line is split: number, age and owner on the left, the Bug and Depends-On values right-aligned, each side clipped on its own; the full set is in the detail row. Reads as metadata rather than status, and stays out of the way of the tally and branch badges on a family card.',
  },
  '7-footer': {
    afterRows: (t, c) => `<div class="card-foot"><span class="fm" title="${esc(c.body)}">${esc(c.body.split('\n')[0])}${c.body.includes('\n') ? '…' : ''}</span>${shown(t).map(([k, v]) => `<span class="fi" title="${esc(k)}: ${esc(v)}"><span class="k">${esc(k)}</span>${esc(short(v))}</span>`).join('')}</div>`,
    rowAfter: (t, c, o) => (o.open ? '' : `<tr class="lfoot${o.member ? ' mem' : ''}${o.last ? ' end' : ''}"><td colspan="4"><span class="lf">${shown(t).map(([k, v]) => `<span class="fi" title="${esc(k)}: ${esc(v)}"><span class="k">${esc(k)}</span>${esc(short(v))}</span>`).join('')}</span></td></tr>`),
    detail: (t, c) => `<div class="card-foot in-detail"><span class="fm">${esc(c.body.split('\n')[0])}…</span>${shown(t).map(([k, v]) => `<span class="fi"><span class="k">${esc(k)}</span>${esc(short(v))}</span>`).join('')}</div>`,
    note: '<b>7 · A footer strip on the card.</b> A tinted band along the bottom edge of the card, mirroring the title line at the top: the first line of the commit message body in grey, then the trailers as key/value pairs. The branch rows in between are untouched, and a family gets one strip under all its branches. <b>Compact:</b> a tinted footer line under each row, full width, with the trailers only; it becomes part of the detail row when the change is opened. Costs one line per card in both layouts, but the tags are always visible and never fight the subject or the badges for the same line.',
  },
  '8-popover': {
    cls: 'v8',
    // #4088 and the two branches of the family stand in for commits whose messages have no trailers at all.
    numExtra: (t, r) => {
      const s = NOTAG.has(r.num) ? [] : shown(t)
      if (s.length === 0) return `<button class="tagbtn none" title="No tags in the commit message">${tagIco}<span>no tags</span></button>${r.num === 4130 ? '<span class="tip">No tags in the commit message</span>' : ''}`
      return `<button class="tagbtn${r.num === 4102 ? ' open' : ''}" title="${s.map(([k, v]) => `${k}: ${v}`).join('\n')}">${tagIco}<span>${s.length}</span></button>${r.num === 4102 ? `<div class="pop">${footer(changes[1], t)}</div>` : ''}`
    },
    noOpen: true,
    rowLine: (t, c) => (c.num === 4102 ? `<div class="pop">${footer(c, t)}</div>` : ''),
    subExtra: (t, c) => {
      const s = NOTAG.has(c.num) ? [] : shown(t)
      if (s.length === 0) return [`<button class="tagbtn sm none" title="No tags in the commit message">${tagIco}<span>no tags</span></button>`]
      return [`<button class="tagbtn sm">${tagIco}<span>${s.length}</span></button>`]
    },
    note: '<b>8 · Hover popover.</b> A tag icon with a count sits beside the change number, nothing else changes on the card. Hovering or clicking it opens a popover with the commit message: body in grey and every trailer as written, with Change-Id faded. When the commit message has no tags at all (here both branches of the family under review, and #4088), the icon becomes a solid red badge reading "no tags", since every change is expected to carry at least one. <b>Compact:</b> the same icon after the number on the meta line, with the same popover, so the row stays two lines and the detail row stays as it is.',
  },
  '9-badge': {
    stateExtra: (t) => tagsOf(t, ['Bug', 'Relates-To', 'Depends-On']).map(bugBadge).join(''),
    subExtra: (t) => tagsOf(t, ['Bug', 'Depends-On', 'Relates-To']).map(([k, v]) => `<span class="k">${k === 'Depends-On' ? 'dep' : k === 'Relates-To' ? 'rel' : 'bug'}</span> ${esc(short(v))}`),
    detailBadges: (t) => tagsOf(t, ['Bug', 'Relates-To', 'Depends-On']).map(bugBadge).join(''),
    detail: (t) => `<div class="ldet-trailers">${shown(t).filter(([k]) => !['Bug', 'Relates-To', 'Depends-On'].includes(k)).map(([k, v]) => kv(k, v)).join('<span class="sep"> · </span>')}</div>`,
    note: '<b>9 · Badges in the state cell.</b> Only the trailers that point somewhere become badges, next to the state badge on each branch row: Bug and Relates-To in red, Depends-On in blue with a link icon; each opens the tracker or the change. Test and the rest are in the tooltip and, on the compact window, in the detail row. The row already carries "Needs Review" and "Active" as badges, so a bug number in the same shape reads as one more fact about the branch. <b>Compact:</b> the row shows them as short text after the number, and the detail row has the badges. Says the least, but says it in the row itself and per branch, where a cherry-pick may cite a different bug.',
  },
  '10-pane': {
    cls: 'v10',
    selected: 's3',
    headRight: () => `<button class="btn subtle det">Details ›</button>`,
    pane: () => `<aside class="pane">${paneBody(changes[0], changes[0].trailers)}</aside>`,
    noOpen: true,
    frameOverlay: () => `<div class="sheet-back"></div><div class="sheet">${paneBody(changes[0], changes[0].trailers, 'sheet-body')}</div>`,
    note: '<b>10 · A details pane.</b> Nothing about the trailers on the cards at all. A subtle Details button on the title line (or clicking the card) opens a pane on the right that shows the whole change: subject, state, the commit message body, the trailers as a table with Bug and Depends-On as links, and Open in Gerrit. The selected card is outlined. The pane could later carry more that does not fit a row: the file list, the last comments, the CI links. <b>Compact:</b> the same content as a sheet that slides up over the ledger, dismissed by a tap outside it. Most room for the tags of any idea and no cost on the rows, but the tags are a click away, and the full window needs to be wide (this page is 1400px) for the pane to sit beside the cards rather than over them.',
  },
})

for (const [name, v] of Object.entries(variants)) fs.writeFileSync(new URL(`${name}.html`, import.meta.url), page(v))
console.log('wrote', Object.keys(variants).join(', '))
