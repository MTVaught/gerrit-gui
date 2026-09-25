// Writes the five "how to open the sequence manager" mockups. Run: node docs/mockups/dependency-chains/toggle/gen.mjs
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICON, chain, single, flags, card, section, page, todayCards } from '../lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

// --- 1. Flags menu ------------------------------------------------------------

const item1 = `<span class="menu-item sep"><span>Sequence…</span><span class="muted">5 related changes</span></span>`
const body1 = todayCards((m) => (m.n === 62 ? { wipCell: flags(m, { open: true, extra: item1 }) } : {}))
const note1 = `<b>1 · Flags menu.</b> A third line, "Sequence…", in the menu the owner already opens for WIP and Private, on every change that has relatives; the detail says how many. It opens the manager for that change's relation set. Once a sequence exists the line reads "Edit sequence…". Nothing new on the board until then. The menu is the one place on a card for owner flags, so this is the smallest addition, but the option is hidden behind a caret and the owner has to know it is there.`

// --- 2. Head-line tab, like "+ Slack" ------------------------------------------

const css2 = `
.tabmark.seq { right: 120px; opacity: 1; white-space: nowrap; gap: 5px; }
.tabmark.seq svg { width: 11px; height: 11px; flex: 0 0 auto; }
.tabmark.seq.add { color: var(--muted); }
.tabmark.seq.hot { color: var(--fg); border-color: var(--muted); }
`
const body2 = todayCards((m) =>
  chain.members.includes(m)
    ? { cls: m.n === 62 ? 'hovered' : '', headExtra: `<span class="tabmark seq add ${m.n === 62 ? 'hot' : ''}">${ICON.chain} ${m.n === 62 ? 'Set up a sequence · 5 related changes' : '+ sequence'}</span>` }
    : {},
)
const note2 = `<b>2 · Head-line tab.</b> A dashed tab hangs from the top edge of every card that has a parent or child on the same branch, beside the "+ Slack" tab. It reads "+ sequence" and shows on hover; hovering it says what it opens, and a click opens the manager. Once a sequence exists the chain card carries a solid "sequence" tab that opens the same manager to edit it. The affordance is visible only on the cards that can use it, which is a hint on its own, but it competes for the corner with the Slack tab and hover-only controls are easy to miss.`

// --- 3. A bar between the cards ------------------------------------------------

const css3 = `
.seq-bar { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; padding: 6px 12px; border: 1px dashed var(--band-border); border-radius: 8px; background: var(--band); font-size: 12.5px; color: var(--muted); }
.seq-bar .badge.chain { background: var(--bg); }
.seq-bar b { color: var(--fg); }
.seq-bar .nums { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.seq-bar .btn { margin-left: auto; padding: 3px 10px; font-size: 12.5px; }
`
const bar3 = `<li class="seq-bar"><span class="badge chain">${ICON.chain} 4 related</span><span><b>#61, #62, #63, #64</b> are built on each other on <span class="nums">master</span>, topic <span class="nums">settings-table</span>.</span><span class="btn">Set up a sequence…</span></li>`
const by3 = (n) => chain.members.find((m) => m.n === n)
const body3 = [
  section('Approved', 1, card(by3(61), chain)),
  section('Out for review', 3, [bar3, card(by3(62), chain), card(by3(63), chain), card(single, single)].join('')),
  section('In progress, review not requested', 1, card(by3(64), chain)),
].join('')
const note3 = `<b>3 · Bar between the cards.</b> When the board finds a set of the owner's open changes built on each other and none is tagged, it draws one bar in the section of the lowest change that waits on anything, naming the changes, with a button that opens the manager. After saving, the bar is gone and the chain card's head gets an "Edit sequence…" button in its place. The offer is impossible to miss and needs no knowledge of the menu, but it is one more element on a tab that already has many, and every untagged relation set gets one until the owner acts or dismisses it.`

// --- 4. Chain card header, always drawn, toggle on it --------------------------

const css4 = `
.change.chain.off { border-style: dashed; }
.change.chain.off .change-head { margin-bottom: 0; }
.change.chain.off .change-row { display: none; }
.change.chain.off .subject { color: var(--muted); }
`
const sw4 = (on, text) => `<span class="btn" style="margin-left:auto;padding:3px 10px;font-size:12.5px">${text}</span>`
const collapsed4 = `<li class="change chain off state-in-progress">
<div class="change-head"><span class="badge chain">${ICON.chain} 4 related</span><span class="subject">#61, #62, #63, #64 on <code>master</code></span><span class="muted small">shown as four cards until a sequence is set up</span>${sw4(false, 'Set up a sequence…')}</div></li>`
const by4 = (n) => chain.members.find((m) => m.n === n)
const body4 = [
  section('Approved', 1, card(by4(61), chain)),
  section('Out for review', 3, [collapsed4, card(by4(62), chain), card(by4(63), chain), card(single, single)].join('')),
  section('In progress, review not requested', 1, card(by4(64), chain)),
].join('')
const note4 = `<b>4 · Stub card.</b> A related set the owner has not tagged gets a stub: a dashed card with the chain badge, the numbers and a "Set up a sequence…" button, and the four ordinary cards stay where they are. Saving in the manager turns the stub into the chain card, whose head carries the same button as "Edit sequence…". The button is in the same place in both states, so the owner learns it once. Against design 3 it costs a card-height stub instead of a bar; against design 1 it adds a button to the head line of the chain card.`

// --- 5. In the request-review menu ---------------------------------------------

const css5 = `
.menu.req { position: absolute; bottom: calc(100% + 4px); right: 0; width: 360px; z-index: 40; padding: 8px; white-space: normal; }
.menu.req h4 { margin: 2px 4px 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 700; }
.menu.req .menu-item { padding-left: 10px; }
.menu.req .opt { display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; border-radius: 5px; font-size: 13px; }
.menu.req .opt .box { width: 14px; height: 14px; border: 1px solid var(--muted); border-radius: 3px; margin-top: 2px; flex: 0 0 auto; }
.menu.req .opt .muted { font-size: 12px; display: block; }
.menu.req .foot { display: flex; justify-content: flex-end; gap: 8px; margin: 8px 4px 0; padding-top: 8px; border-top: 1px solid var(--border); }
`
const req5 = `<span class="split" style="position:relative"><span class="btn primary split-main" aria-expanded="true">Request (PS 1)</span><span class="btn primary split-caret">▾</span>
<div class="menu req"><h4>Ask the primary reviewers</h4>
<span class="menu-item"><span>Pass-around review</span><span class="muted">each reviewer on their own</span></span>
<span class="menu-item"><span>In-person review</span><span class="muted">together with you</span></span>
<span class="menu-item sep"><span>Set up a sequence…</span><span class="muted">5 related changes</span></span>
</div></span>`
const body5 = todayCards((m) => (m.n === 64 ? { mainCell: req5 } : {}))
const note5 = `<b>5 · In the request menu.</b> A last line in the Request review menu, "Set up a sequence…", offered when the change has relatives. It opens the manager without sending the request; the owner saves the sequence, then requests as usual. The line lives where the owner is already thinking about reviewers and order. It is only on changes not yet requested, so once every change in the set is out for review there is no way back to the manager from here, and it needs a second home such as the flags menu.`

const pages = [
  ['1-flags-menu', '1 Flags menu', '', body1, note1],
  ['2-head-tab', '2 Head-line tab', css2, body2, note2],
  ['3-bar', '3 Bar between the cards', css3, body3, note3],
  ['4-stub-card', '4 Stub card', css4, body4, note4],
  ['5-request-menu', '5 In the request menu', css5, body5, note5],
]
for (const [file, title, css, body, note] of pages) {
  writeFileSync(path.join(here, `${file}.html`), page(title, css, body, note))
  console.log('wrote', file + '.html')
}
