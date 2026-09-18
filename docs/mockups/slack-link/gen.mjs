// Writes the five mockups next to this file. Each page shows the same two
// changes in the full window and in the compact window, with the Slack
// conversation presented one way. Render with ../shot.cjs.
//   node docs/mockups/slack-link/gen.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const URL_A = 'https://acme.slack.com/archives/C04ABCD1234/p1726500000123456'

const bubble = (size = 13) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z"/></svg>`

const topbar = (compact) =>
  compact
    ? `<header class="topbar"><nav class="tabs"><button class="tab">To review <span class="count">0</span></button><button class="tab">Reviewing <span class="count">2</span></button><button class="tab active">Mine <span class="count">4</span></button><button class="tab">Merged <span class="count">5</span></button></nav><div class="topbar-right"><span class="btn view-btn">⚟ <span class="arrow">▾</span></span><span class="btn icon">⟳</span><span class="btn icon on">⤢</span><span class="btn icon">⚙</span></div></header>`
    : `<header class="topbar"><nav class="tabs"><button class="tab">To review <span class="count">0</span></button><button class="tab">Reviewing <span class="count">2</span></button><button class="tab active">Mine <span class="count">4</span></button><button class="tab">Merged <span class="count">5</span></button></nav><div class="topbar-right"><span class="btn view-btn">View <span class="arrow">▾</span></span><span class="btn icon">⟳</span><span class="btn icon">⤡</span><span class="btn icon">⚙</span></div></header>`

/** The two changes every mockup shows: A has a conversation linked, B has none yet. */
const A = { subject: 'Fix token refresh race in session store', num: 48, ps: 3, diff: ['+42', '−7'], age: '20m ago', chips: `<span class="chip pos">Bob <b>+1</b></span><span class="chip pending">Carol</span>`, avatars: `<span class="av h0">B<i class="v pos">+1</i></span><span class="av h3">C<i class="v pend"></i></span>` }
const B = { subject: 'Bump protobuf to 4.25.3', num: 51, ps: 1, diff: ['+3', '−3'], age: '2h ago', chips: `<span class="chip pending">Bob</span><span class="chip pending">Dave</span>`, avatars: `<span class="av h0">B<i class="v pend"></i></span><span class="av h4">D<i class="v pend"></i></span>` }

/**
 * One card of the full window. `x` holds the design's additions: head (in
 * the title line), subject (right after the subject), origin (after the
 * project and owner), chip (after the "+" in the reviewers line), action
 * (first button), wip (the last column), after (a full-width line under the row).
 */
function card(c, x = {}) {
  return `<li class="change state-needs-review">${x.corner ?? ''}
  <div class="change-head">${x.lead ?? ''}<button class="link subject">${c.subject}</button>${x.subject ?? ''}<span class="muted small origin">platform/core · you${x.origin ?? ''}</span>${x.head ?? ''}${x.headRight ?? ''}</div>
  <div class="change-row">
    <span class="cell c-branch"><button class="link"><code>master</code></button></span>
    <span class="cell c-state"><span class="badge needs-review">Needs Review</span>${x.state ?? ''}</span>
    <span class="cell c-ci"><span class="badge active">Active</span></span>
    <span class="cell c-num"><button class="link">#${c.num}</button></span>
    <span class="cell c-ps"><span>PS ${c.ps}</span><span class="req">asked</span></span>
    <div class="cell c-reviewers"><div class="reviewers">${c.chips}<span class="trailing"><button class="chip add">+</button>${x.chip ?? ''}</span></div></div>
    <span class="cell c-diff"><span><span class="ins">${c.diff[0]}</span> <span class="del">${c.diff[1]}</span></span></span>
    <span class="cell c-updated muted">${c.age}</span>
    <div class="cell c-actions actions">${x.action ?? ''}<button class="btn">Withdraw request</button></div>
    <div class="cell c-wip actions">${x.wip ?? `<div class="flags-menu"><button class="btn subtle">Mark WIP<span class="arrow">▾</span></button></div>`}</div>
  </div>${x.after ?? ''}${x.rows ?? ''}
</li>`
}

/** One line of the compact ledger, open, with its detail row. */
function line(c, x = {}) {
  return `<tr class="lrow state-needs-review open"><td class="c">${x.corner ?? ''}<button class="link t">${x.lead ?? ''}<span class="txt">${c.subject}</span>${x.title ?? ''}</button><div class="s">#${c.num}${x.sub ?? ''}<span class="sep">·</span>${c.age}<span class="sep">·</span>PS ${c.ps}<span class="sep">·</span><span class="ins">${c.diff[0]}</span> <span class="del">${c.diff[1]}</span></div>${x.line ?? ''}</td><td class="ci"><span class="badge active">Active</span></td><td class="r"><span class="stack">${c.avatars}${x.avatar ?? ''}</span></td><td class="a"><button class="btn sm more">···</button></td></tr>
<tr class="ldetail"><td colspan="4"><div class="ldet-badges"><span class="badge needs-review">Needs Review</span>${x.badge ?? ''}<span class="muted">platform/core · master · review requested for PS ${c.ps}</span></div><div class="reviewers">${c.chips}<span class="trailing"><button class="chip add">+</button>${x.chip ?? ''}</span></div>${x.detail ?? ''}<div class="ldet-actions"><button class="btn sm subtle">Mark WIP</button>${x.action ?? ''}<button class="btn sm">Withdraw request</button><button class="btn sm">Open in Gerrit ↗</button></div></td></tr>${x.rows ?? ''}`
}

function page(title, css, full, compact, note) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="base.css"><style>
.app{min-height:0}
.menu{position:absolute}.picker-wrap{position:relative}.menu.picker{top:calc(100% + 4px);left:0}
.mock-h{margin:18px 16px 0;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.mock-compact{width:460px;margin:8px 16px 0;border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:0 2px 12px #0002}
.mock-note{margin:18px 16px 4px;padding:8px 10px;border:1px dashed var(--border);border-radius:6px;font-size:12px;color:var(--muted)}
.chip .chip-x,.badge .chip-x{opacity:.7;max-width:1.4em;padding-left:2px}
${css}</style></head><body>
<div class="mock-h">Full window</div>
<div class="app">${topbar(false)}<main class="board"><div class="sections"><section class="group"><h3>Out for review <span class="count">2</span></h3><ul class="changes">${full}</ul></section></div></main></div>
<div class="mock-h">Compact window</div>
<div class="mock-compact"><div class="app compact">${topbar(true)}<main class="board"><table class="ledger"><colgroup><col><col class="ci"><col class="rv"><col class="ac"></colgroup><thead><tr><th>Change</th><th>CI</th><th>Reviewers</th><th></th></tr></thead><tbody><tr class="g"><td colspan="4">Out for review <span class="count">2</span></td></tr>${compact}</tbody></table></main></div></div>
<div class="mock-note">${note}</div>
</body></html>
`
}

const pill = `<span class="badge slack" title="${URL_A}"><button class="link">${bubble()}Slack thread ↗</button><button class="chip-x">×</button></span>`
const popover = `<div class="menu picker slack" role="dialog"><h4>Link a Slack thread</h4><p class="muted small">Paste the link from “Copy link” on the message. It is stored on the change as the hashtag slack:&lt;link&gt;, so Gerrit shows it too.</p><div class="picker-search"><input value="https://acme.slack.com/archives/C04ABCD1234/p17265" aria-label="Slack link"></div><div class="picker-foot"><button class="link muted">Cancel</button><button class="btn primary">Link</button></div></div>`
const addLink = (open = false) => `<span class="picker-wrap slack-add"><button class="link muted small"${open ? ' aria-expanded="true"' : ''}>+ Slack thread</button>${open ? popover : ''}</span>`
const mark = `<button class="link slack-mark" title="${URL_A}">${bubble(12)}</button>`

const designs = [
  {
    file: '1-head-pill.html',
    title: '1 Pill in the title line',
    css: `.board{padding-bottom:150px}`,
    full: card(A, { head: pill }) + card(B, { head: addLink(true) }),
    compact: line(A, { sub: `<span class="sep">·</span>${mark}`, badge: pill }) + line(B, { badge: addLink() }),
    note: `Design 1 · A pill in the title line of the card, after the project and owner: "Slack thread ↗" opens the conversation, its × (on hover) removes the tag. A change without one shows a muted "+ Slack thread" in the same place, which opens a panel with one field for the link. In the compact window the sub-line carries a bubble that opens the conversation without opening the line; the detail row shows the same pill, or the same "+ Slack thread".`,
  },
  {
    file: '2-reviewer-chip.html',
    title: '2 Chip among the reviewers',
    css: `.chip.slack{background:var(--panel);color:var(--fg)}.chip.slack svg{color:var(--accent)}.av.slack{background:var(--panel);color:var(--accent);border:2px solid var(--bg);box-shadow:0 0 0 1px var(--border)}`,
    full: card(A, { chip: `<span class="chip slack" title="${URL_A}">${bubble(12)}Slack ↗<button class="chip-x">×</button></span>` }) + card(B, { chip: `<span class="picker-wrap"><button class="chip add slack-add">${bubble(12)} +</button></span>` }),
    compact: line(A, { avatar: `<span class="av slack" title="${URL_A}">${bubble(11)}</span>`, chip: `<span class="chip slack">${bubble(12)}Slack ↗</span>` }) + line(B, { chip: `<button class="chip add">${bubble(12)} +</button>` }),
    note: `Design 2 · The conversation is a participant: a chip in the reviewers line, after the "+", and a bubble in the avatar stack of the compact line. A change without one has a second "+" with a bubble, which opens the same link panel. The reviewers line is already the busiest cell, and the avatar column fits three circles, so a change with three reviewers loses the bubble to the "+n".`,
  },
  {
    file: '3-action-button.html',
    title: '3 Button among the actions',
    css: `.menu.flags{top:calc(100% + 4px);right:0;left:auto}.flags-menu{position:relative}.board{padding-bottom:110px}`,
    full:
      card(A, { action: `<button class="btn" title="${URL_A}">${bubble(12)} Slack ↗</button>` }) +
      card(B, {
        wip: `<div class="flags-menu"><button class="btn subtle" aria-expanded="true">Mark WIP<span class="arrow">▾</span></button><div class="menu flags" role="menu"><button class="menu-item"><span>Mark WIP</span><span class="muted">stops CI</span></button><button class="menu-item"><span>Make private</span><span class="muted">hides it from others</span></button><hr><button class="menu-item"><span>Link Slack thread…</span><span class="muted">adds a slack: tag</span></button></div></div>`,
      }),
    compact: line(A, { action: `<button class="btn sm">${bubble(12)} Slack ↗</button>` }) + line(B, { action: `<button class="btn sm">Link Slack thread…</button>` }),
    note: `Design 3 · A button "Slack ↗" among the actions of the row, in the full window and in the detail row of the compact window. Nothing is added to a change without a conversation: the owner links one from the WIP menu in the last column ("Link Slack thread…"), and in the compact detail row from a plain button. The line itself does not say whether a conversation exists, so the reviewer has to open the line to find out.`,
  },
  {
    file: '4-discussion-line.html',
    title: '4 Line under the row',
    css: `.talk{grid-column:1 / -1;display:flex;gap:8px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);font-size:12.5px}.talk svg{color:var(--accent)}.talk .who{color:var(--muted)}.talk .unlink{margin-left:auto;color:var(--muted);font-size:12px}.talk.none{color:var(--muted);border-top-style:dashed}.ledger .s.talk{margin-top:2px;border:none;padding:0;display:flex;gap:4px;align-items:center;color:var(--accent)}`,
    full:
      card(A, { after: `<div class="talk">${bubble(13)}<button class="link">Discussed on Slack ↗</button><span class="who">acme.slack.com · linked by Alice · 2h ago</span><button class="link unlink">unlink</button></div>` }) +
      card(B, { after: `<div class="talk none"><button class="link muted">+ Link the Slack conversation about this change</button></div>` }),
    compact: line(A, { line: `<div class="s talk">${bubble(11)} Slack thread ↗</div>` }) + line(B, { badge: addLink() }),
    note: `Design 4 · A line of its own under the row: "Discussed on Slack ↗", the workspace, who linked it (from the change log) and an "unlink" at the right. A change without one shows a muted "+ Link the Slack conversation about this change" line. In the compact window the line becomes a third line in the cell. The card grows by a line for every change, whether or not it has a conversation.`,
  },
  {
    file: '5-subject-mark.html',
    title: '5 Bubble after the subject',
    css: `.subject-mark{display:inline-flex;align-items:center;color:var(--accent);vertical-align:-1px}.subject-mark svg{width:14px;height:14px}.ledger .t{display:flex;align-items:center;gap:4px}.ledger .t .txt{overflow:hidden;text-overflow:ellipsis}.ledger .t .subject-mark{flex:0 0 auto}.ledger .t .subject-mark svg{width:12px;height:12px}`,
    full: card(A, { subject: `<button class="link subject-mark" title="Slack conversation: ${URL_A}">${bubble(14)}</button>` }) + card(B, { origin: ` · <button class="link">+ Slack</button>` }),
    compact: line(A, { title: `<span class="subject-mark">${bubble(12)}</span>`, badge: pill }) + line(B, { badge: addLink() }),
    note: `Design 5 · Only a bubble, right after the subject, in both windows; the tooltip holds the link and a click opens it. A change without one shows "+ Slack" at the end of the project and owner text. The quietest of the five; it relies on the reader knowing what the bubble means, and gives no way to unlink except from the detail row (compact) or Gerrit (full).`,
  },
  {
    file: '6-state-badge.html',
    title: '6 Badge beside the state',
    css: `.badge.slackb{display:inline-flex;gap:4px;align-items:center;background:var(--panel);border:1px solid var(--border);color:var(--fg)}.badge.slackb svg{color:var(--accent)}.badge.slackb.add{border-style:dashed;color:var(--muted)}.ledger .s .badge{font-size:10px;padding:0 6px;vertical-align:1px}`,
    full: card(A, { state: `<span class="badge slackb" title="${URL_A}">${bubble(11)}Slack ↗<button class="chip-x">×</button></span>` }) + card(B, { state: `<button class="badge slackb add">+ Slack</button>` }),
    compact: line(A, { sub: `<span class="sep">·</span><span class="badge slackb">${bubble(10)}Slack</span>`, badge: `<span class="badge slackb">${bubble(11)}Slack ↗<button class="chip-x">×</button></span>` }) + line(B, { badge: `<button class="badge slackb add">+ Slack</button>` }),
    note: `Design 6 · A badge in the state cell, next to "Needs Review", drawn like the Private badge: outlined, with a bubble. A change without one shows a dashed "+ Slack" badge in the same cell. In the compact window the sub-line carries a small "Slack" badge and the detail row the full one. The badge sits with the other facts about the change, but the state cell is read for the state, and a second pill there makes it slower to scan.`,
  },
  {
    file: '7-corner-tab.html',
    title: '7 Tab on the corner of the card',
    css: `.tabmark{position:absolute;top:-1px;right:14px;display:inline-flex;gap:4px;align-items:center;padding:1px 8px 2px;border:1px solid var(--accent);border-top:none;border-radius:0 0 6px 6px;background:var(--pending-bg);color:var(--accent);font-size:11px;font-weight:500}.tabmark.add{color:var(--muted);border:1px dashed var(--border);border-top:none;background:var(--panel);font-weight:400}.change-head{padding-right:110px}.ledger td.c{position:relative}.ledger .tabmark{top:0;right:0;padding:0 6px 1px;font-size:10px}.ledger .t{max-width:calc(100% - 60px)}`,
    full: card(A, { corner: `<button class="link tabmark" title="${URL_A}">${bubble(11)}Slack ↗</button>` }) + card(B, { corner: `<button class="link tabmark add">${bubble(11)}+ Slack</button>` }),
    compact: line(A, { corner: `<button class="link tabmark" title="${URL_A}">${bubble(10)}Slack</button>`, badge: pill }) + line(B, { corner: `<button class="link tabmark add">${bubble(10)}+</button>`, badge: addLink() }),
    note: `Design 7 · A small tab hanging from the top edge of the card, at the right, out of every column: "Slack ↗" opens the conversation. A change without one hangs a dashed "+ Slack" tab while the pointer is over the card (shown here on the second card). In the compact window the tab hangs from the top edge of the line, over the right end of the subject. The tab is easy to find on every card at a glance and takes no room from the cells, but it is a new kind of control on the board. This is what the application does.`,
  },
  {
    file: '8-links-tray.html',
    title: '8 Links at the right of the title line',
    css: `.change-head .links{margin-left:auto;display:inline-flex;gap:4px}.change-head .links .btn{padding:2px 8px;font-size:12px;display:inline-flex;gap:4px;align-items:center}.change-head .links .btn svg{color:var(--accent)}`,
    full:
      card(A, { headRight: `<span class="links"><button class="btn">Gerrit ↗</button><button class="btn" title="${URL_A}">${bubble(12)}Slack ↗</button></span>` }) +
      card(B, { headRight: `<span class="links"><button class="btn">Gerrit ↗</button><button class="btn subtle">+ link</button></span>` }),
    compact: line(A, { action: `<button class="btn sm">${bubble(12)} Slack ↗</button>` }) + line(B, { action: `<button class="btn sm subtle">+ link</button>` }),
    note: `Design 8 · Everywhere the change lives, in one place: a tray of links at the right end of the title line, "Gerrit ↗" and "Slack ↗", the second only when a conversation is linked. "+ link" in the tray adds one. In the compact window the tray is the row of buttons in the detail row, next to "Open in Gerrit ↗", and the line itself says nothing. The subject stays untouched, but the Gerrit button repeats what the subject already does.`,
  },
  {
    file: '9-conversation-row.html',
    title: '9 A row of its own, like a branch',
    css: `.talkrow .c-branch code{color:var(--accent);font-weight:600}.talkrow .span{grid-column:2 / 10}.talkrow .span svg{color:var(--accent)}.talkrow .span .muted{margin-left:4px}.talkrow.none .c-branch code{color:var(--muted);font-weight:500}.ledger tr.talk td{background:var(--band);border-bottom-color:var(--band-border)}.ledger tr.talk td.c{padding-left:14px;border-left-color:var(--accent)}.ledger tr.talk .t{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--accent)}.ledger tr.talk .s{color:var(--fg)}`,
    full:
      card(A, { rows: `<div class="change-row talkrow"><span class="cell c-branch"><code>slack</code></span><span class="cell span">${bubble(13)}<button class="link">Discussed on Slack ↗</button><span class="muted">acme · message of 16 Sep · linked by Alice</span></span><span class="cell c-wip actions"><button class="btn subtle">Unlink</button></span></div>` }) +
      card(B, { rows: `<div class="change-row talkrow none"><span class="cell c-branch"><code>slack</code></span><span class="cell span"><button class="link muted">+ Link the Slack conversation about this change</button></span><span class="cell c-wip"></span></div>` }),
    compact:
      line(A, { rows: `<tr class="lrow talk"><td class="c"><span class="t">slack</span><div class="s">${bubble(11)} Discussed on Slack · 16 Sep</div></td><td class="ci"></td><td class="r"></td><td class="a"><button class="btn sm">Open ↗</button></td></tr>` }) +
      line(B, { rows: `<tr class="lrow talk"><td class="c"><span class="t muted">slack</span><div class="s muted">no conversation linked</div></td><td class="ci"></td><td class="r"></td><td class="a"><button class="btn sm subtle">+ link</button></td></tr>` }),
    note: `Design 9 · The conversation is a row of the card, under the branch rows, titled "slack" in the branch column as a branch is titled by its name: "Discussed on Slack ↗", the workspace, the date of the message and who linked it, with "Unlink" in the last column. A change without one has a muted row with "+ Link the Slack conversation". In the compact window the row is a line under the change, as a branch line of a family. It reads well in a family card, where the conversation is about the change on every branch; on a single change it doubles the card.`,
  },
  {
    file: '10-leading-mark.html',
    title: '10 Bubble before the subject',
    css: `.lead{display:inline-flex;align-items:center;color:var(--accent);margin-right:2px}.lead svg{width:15px;height:15px}.ledger .t{display:flex;align-items:center;gap:4px}.ledger .t .txt{overflow:hidden;text-overflow:ellipsis}.ledger .t .lead{flex:0 0 auto}.ledger .t .lead svg{width:12px;height:12px}`,
    full: card(A, { lead: `<button class="link lead" title="Slack conversation: ${URL_A}">${bubble(15)}</button>` }) + card(B),
    compact: line(A, { lead: `<span class="lead">${bubble(12)}</span>`, badge: pill }) + line(B, { badge: addLink() }),
    note: `Design 10 · A bubble in front of the subject, where a family card carries its fork glyph, in both windows; the tooltip holds the link and a click opens it. Nothing at all on a change without one: the owner links a conversation from the WIP menu ("Link Slack thread…", as in design 3), and in the compact window from the detail row. The cards line up by their subjects, so a bubble in front of some of them shifts those subjects to the right.`,
  },
]

for (const d of designs) {
  fs.writeFileSync(path.join(dir, d.file), page(d.title, d.css, d.full, d.compact, d.note))
  console.log('wrote', d.file)
}
