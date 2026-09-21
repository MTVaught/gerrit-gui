// Generates the mockups: node docs/mockups/review-delta/mock.js
// Three additions, five alternatives each: the reviewer's earlier vote, the lines changed since that review, and where the unresolved count sits.
const fs = require('node:fs')
const path = require('node:path')

const rows = [
  { subject: 'Add retry to upload client', num: 31, ps: 5, base: null, vote: null, total: [84, 12], delta: null, unresolved: 0, primary: true },
  { subject: 'Fix flaky scheduler test', num: 27, ps: 5, base: 3, vote: 1, total: [23, 9], delta: [6, 2], unresolved: 2, primary: true },
  { subject: 'Migrate config to TOML', num: 19, ps: 2, base: 1, vote: -1, total: [310, 198], delta: [142, 37], unresolved: 11, primary: true },
  { subject: 'Rename Storage helpers', num: 24, ps: 4, base: 2, vote: null, total: [41, 41], delta: [3, 3], unresolved: 1, primary: true },
  { subject: 'Bump build dependencies', num: 12, ps: 3, base: 3, vote: 1, total: [6, 6], delta: null, unresolved: 0, primary: false },
]
const fmt = (v) => (v > 0 ? `+${v}` : `−${-v}`)
const counts = ([i, d]) => `<span class="ins">+${i}</span> <span class="del">−${d}</span>`
const upToDate = (r) => r.base !== null && r.base >= r.ps

const base = {
  cols: 11,
  label: (r) => (upToDate(r) ? `Open PS ${r.ps}` : r.base !== null ? `Review PS ${r.base} → ${r.ps}` : `Review PS ${r.ps}`),
  caption: () => '',
  youChip: (r) => `<span class="chip ${r.primary ? 'pending' : ''}">you</span>`,
  psExtra: () => '',
  stateExtra: () => '',
  numExtra: () => '',
  headExtra: () => '',
  diff: (r) => `<span>${counts(r.total)}</span>`,
  unresolvedCell: (r) => `<span class="cell c-unresolved">${r.unresolved ? `<span class="muted">${r.unresolved} unresolved</span>` : ''}</span>`,
  css: '',
}

function row(v, r) {
  const state = r.primary ? 'needs-review' : 'approved'
  const label = r.primary ? 'Needs Review' : 'Approved'
  const primary = r.primary && !upToDate(r) ? ' primary' : ''
  return `<li class="change state-${state}">
<div class="change-head"><button class="link subject">${r.subject}</button>${v.headExtra(r)}<span class="muted small origin">demo · Alice</span></div>
<div class="change-row">
<span class="cell c-branch"><button class="link"><code>master</code></button></span>
<span class="cell c-state"><span class="badge ${state}">${label}</span>${v.stateExtra(r)}</span>
<span class="cell c-ci"><span class="badge active">Active</span></span>
<span class="cell c-num"><button class="link">#${r.num}</button>${v.numExtra(r)}</span>
<span class="cell c-ps"><span>PS ${r.ps}</span><span class="req">asked</span>${v.psExtra(r)}</span>
<div class="cell c-reviewers"><div class="reviewers">${v.youChip(r)}<span class="chip pos">Carol <b>+1</b></span><span class="trailing"><button class="chip add">+</button></span></div></div>
<span class="cell c-diff">${v.diff(r)}</span>
${v.unresolvedCell(r)}
<span class="cell c-updated muted">2h ago</span>
<div class="cell c-actions actions"><div class="split-wrap"><div class="split"><button class="btn split-main${primary}">${v.label(r)}<span class="arrow">↗</span></button><button class="btn split-caret${primary}">▾</button></div>${v.caption(r)}</div></div>
<div class="cell c-wip actions"></div>
</div></li>`
}

function page(v) {
  const cols = Array(v.cols).fill('max-content')
  cols[5] = 'minmax(140px, 1fr)'
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>
body { padding: 14px; }
.sections { grid-template-columns: ${cols.join(' ')}; }
.split-wrap { display: inline-flex; flex-direction: column; align-items: stretch; }
.mock-note { max-width: 900px; margin: 18px 4px 0; font-size: 13px; color: var(--muted); }
${v.css}
</style></head><body><div class="sections"><div class="group"><h3>Pass around <span class="count">${rows.length}</span></h3><ul class="changes">
${rows.map((r) => row(v, r)).join('\n')}
</ul></div></div><p class="mock-note"><b>${v.title}.</b> ${v.note}</p></body></html>`
}

const voteText = (r) => (r.base === null || upToDate(r) ? '' : r.vote === null ? `commented on PS ${r.base}` : `${fmt(r.vote)} on PS ${r.base}`)
const voteCls = (r) => (r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : 'none')

const variants = {
  // A. The earlier vote.
  'vote-1-in-label': {
    title: 'Vote 1 · In the label',
    note: 'The vote goes into the button text, between the two patch sets it separates: <b>Review PS 3 (+1) → 5</b>. Nothing new on the row. A comment without a vote shows nothing, only the tooltip explains it.',
    label: (r) => (r.base !== null && !upToDate(r) ? `Review PS ${r.base}${r.vote ? ` <span class="prev ${voteCls(r)}">(${fmt(r.vote)})</span>` : ''} → ${r.ps}` : base.label(r)),
    css: `.btn .prev { font-weight: 600; } .btn:not(.primary) .prev.pos { color: var(--pos); } .btn:not(.primary) .prev.neg { color: var(--neg); }`,
  },
  'vote-2-on-you-chip': {
    title: 'Vote 2 · On the "you" chip',
    note: 'The earlier vote sits where votes already live: the reviewer chip. <b>you · +1 on PS 3</b> in a tinted, dashed chip, since the vote no longer counts. The button keeps its plain range.',
    youChip: (r) => {
      const t = voteText(r)
      if (!t) return base.youChip(r)
      return `<span class="chip pending prev-${voteCls(r)}">you <span class="was">· ${t}</span></span>`
    },
    css: `.chip .was { font-weight: 500; opacity: 0.85; } .chip.prev-pos { border: 1px dashed var(--pos); background: var(--pos-bg); color: var(--pos); } .chip.prev-neg { border: 1px dashed var(--neg); background: var(--neg-bg); color: var(--neg); } .chip.prev-none { border: 1px dashed var(--pending); }`,
  },
  'vote-3-caption': {
    title: 'Vote 3 · Caption under the button',
    note: 'A line of small text under the split button: <b>you voted +1 on PS 3</b>, <b>you voted −1 on PS 1</b>, <b>you commented on PS 2</b>. The button stays as it is; the caption is only there when there is something to say.',
    caption: (r) => {
      if (r.base === null || upToDate(r)) return ''
      const cls = voteCls(r)
      const t = r.vote === null ? `you commented on PS ${r.base}` : `you voted <b>${fmt(r.vote)}</b> on PS ${r.base}`
      return `<span class="cap ${cls}">${t}</span>`
    },
    css: `.cap { font-size: 11px; margin-top: 3px; color: var(--muted); text-align: right; } .cap.pos b { color: var(--pos); } .cap.neg b { color: var(--neg); }`,
  },
  'vote-4-corner-badge': {
    title: 'Vote 4 · Badge on the button corner',
    note: 'A small round badge pinned to the top-left corner of the Review button, like an unread count: green <b>+1</b> or red <b>−1</b>. Reads at a glance across the column; a comment-only review has no badge.',
    caption: (r) => (r.vote && r.base !== null && !upToDate(r) ? `<span class="corner ${voteCls(r)}">${fmt(r.vote)}</span>` : ''),
    css: `.split-wrap { position: relative; } .corner { position: absolute; top: -8px; left: -8px; font-size: 10px; font-weight: 700; line-height: 1; padding: 3px 5px; border-radius: 999px; border: 2px solid var(--bg); } .corner.pos { background: var(--pos); color: #fff; } .corner.neg { background: var(--badge-red); color: #fff; }`,
  },
  'vote-5-in-ps-column': {
    title: 'Vote 5 · In the patch set column',
    note: 'The patch set column already tells the story of the rounds ("asked", "asked PS 2"). A second line adds your part of it: <b>you +1 on PS 3</b>. The button and the reviewers stay untouched.',
    psExtra: (r) => {
      if (r.base === null || upToDate(r)) return ''
      return `<span class="mine ${voteCls(r)}">${r.vote === null ? `you commented on PS ${r.base}` : `you <b>${fmt(r.vote)}</b> on PS ${r.base}`}</span>`
    },
    css: `.c-ps { flex-wrap: wrap; row-gap: 0; max-width: 150px; } .c-ps .mine { flex-basis: 100%; font-size: 11px; color: var(--muted); } .c-ps .mine.pos b { color: var(--pos); } .c-ps .mine.neg b { color: var(--neg); }`,
  },

  // B. Lines changed since the last review.
  'delta-1-stacked': {
    title: 'Delta 1 · Stacked, total first',
    note: 'The whole change on top, and beneath it the part you have not seen: <b>+6 −2 since PS 3</b>, smaller and muted. Rows with nothing new stay a single line.',
    diff: (r) => `<span>${counts(r.total)}</span>${r.delta ? `<span class="since">${counts(r.delta)} <span class="lbl">since PS ${r.base}</span></span>` : ''}`,
    css: `.c-diff { flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; line-height: 1.3; } .c-diff .since { font-size: 11px; color: var(--muted); } .c-diff .since .ins, .c-diff .since .del { opacity: 0.85; }`,
  },
  'delta-2-stacked-new-first': {
    title: 'Delta 2 · Stacked, new first',
    note: 'What matters for the re-review comes first and in full size: <b>+6 −2 new</b>. The whole change follows underneath as <b>+23 −9 total</b> in muted text. A first review shows the total alone.',
    diff: (r) =>
      r.delta
        ? `<span>${counts(r.delta)} <span class="lbl">new</span></span><span class="tot">${counts(r.total)} <span class="lbl">total</span></span>`
        : `<span>${counts(r.total)}</span>`,
    css: `.c-diff { flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; line-height: 1.3; } .c-diff .lbl { font-size: 11px; color: var(--muted); } .c-diff .tot { font-size: 11px; } .c-diff .tot .ins, .c-diff .tot .del { color: var(--muted); }`,
  },
  'delta-3-two-columns': {
    title: 'Delta 3 · Two aligned columns',
    note: 'Two sub-columns side by side, each right-aligned in tabular figures: the whole change, a hairline, then the lines since your last look. Rows line up so the eye can scan either column down the board.',
    diff: (r) => `<span class="tot">${counts(r.total)}</span><span class="new">${r.delta ? `${counts(r.delta)}<span class="lbl"> new</span>` : ''}</span>`,
    css: `.c-diff { gap: 0; font-variant-numeric: tabular-nums; } .c-diff .tot { display: inline-block; min-width: 9ch; text-align: right; } .c-diff .new { display: inline-block; min-width: 9ch; text-align: right; padding-left: 8px; margin-left: 8px; border-left: 1px solid var(--border); font-size: 12px; } .c-diff .new .lbl { color: var(--muted); font-size: 11px; }`,
  },
  'delta-4-inline': {
    title: 'Delta 4 · One line, in brackets',
    note: 'The counts stay on one line: <b>+23 −9 (+6 −2 new)</b>. The row keeps its height; the bracketed part is muted so the total still reads first.',
    diff: (r) => `<span>${counts(r.total)}${r.delta ? ` <span class="new">(${counts(r.delta)} new)</span>` : ''}</span>`,
    css: `.c-diff .new { color: var(--muted); font-size: 12px; } .c-diff .new .ins, .c-diff .new .del { opacity: 0.8; }`,
  },
  'delta-5-under-button': {
    title: 'Delta 5 · Under the Review button',
    note: 'The delta belongs to the diff the button opens, so it sits under the button as a caption: <b>+6 −2 since PS 3</b>. The diff column keeps showing only the whole change.',
    caption: (r) => (r.delta ? `<span class="cap">${counts(r.delta)} <span class="lbl">since PS ${r.base}</span></span>` : ''),
    css: `.cap { font-size: 11px; margin-top: 3px; text-align: right; } .cap .lbl { color: var(--muted); }`,
  },

  // C. Where the unresolved count sits.
  'unresolved-1-own-column': {
    title: 'Unresolved 1 · Its own column',
    note: 'The count gets a grid column of its own after the diff, so it starts at the same x on every row, and is empty where there is nothing unresolved.',
  },
  'unresolved-2-fixed-slot': {
    title: 'Unresolved 2 · Fixed-width slot in the diff cell',
    note: 'Same cell as before, but the counts sit in a fixed-width, right-aligned slot with tabular figures. The unresolved text then always begins at the same spot.',
    cols: 10,
    diff: (r) => `<span class="counts">${counts(r.total)}</span>${r.unresolved ? `<span class="muted">${r.unresolved} unresolved</span>` : ''}`,
    unresolvedCell: () => '',
    css: `.c-diff { flex-direction: row; align-items: center; gap: 8px; } .c-diff .counts { display: inline-block; min-width: 10ch; text-align: right; font-variant-numeric: tabular-nums; }`,
  },
  'unresolved-3-by-number': {
    title: 'Unresolved 3 · Comment icon by the change number',
    note: 'A comment bubble with the count next to <b>#27</b>, where the tags button already sits. Unresolved threads are about the change, not about its size, so they leave the diff column.',
    cols: 10,
    unresolvedCell: () => '',
    numExtra: (r) => (r.unresolved ? `<span class="unres" title="${r.unresolved} unresolved comments"><svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>${r.unresolved}</span>` : ''),
    css: `.unres { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--warn); font-weight: 600; }`,
  },
  'unresolved-4-state-badge': {
    title: 'Unresolved 4 · Badge beside the state',
    note: 'An amber <b>2 unresolved</b> pill after the state badge, like "stale tag". Open threads are a state of the review, so they sit with the other state badges.',
    cols: 10,
    unresolvedCell: () => '',
    stateExtra: (r) => (r.unresolved ? `<span class="badge stale">${r.unresolved} unresolved</span>` : ''),
  },
  'unresolved-5-card-head': {
    title: 'Unresolved 5 · On the title line',
    note: 'A pill on the card\'s title line, next to the subject, like the "3 branches" badge on a family. It is out of the row grid entirely, so no column moves.',
    cols: 10,
    unresolvedCell: () => '',
    headExtra: (r) => (r.unresolved ? `<span class="badge stale">${r.unresolved} unresolved</span>` : ''),
  },
}

for (const [name, v] of Object.entries(variants)) {
  const full = { ...base, ...v }
  fs.writeFileSync(path.join(__dirname, `${name}.html`), page(full))
}
