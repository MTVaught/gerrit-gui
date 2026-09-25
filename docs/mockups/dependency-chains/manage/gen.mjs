// Writes the five "manage a sequence" mockups. Run: node docs/mockups/dependency-chains/manage/gen.mjs
// Each shows the surface the owner uses to say which related changes form the sequence.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICON, LABEL, chain, single, flags, card, section, page, todayCards, row, origin } from '../lib.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Everything Gerrit relates to #62: the four in line, plus a sibling of #63 that also builds on #62. */
const sibling = { n: 65, subject: 'Settings: cache the table reads', state: 'in-progress', ci: 'wip', ps: 1, asked: false, rs: [['Alice', '']], diff: ['+90', '−3'], age: '10m ago', tags: 0, main: 'request', wip: 'Mark active', parent: 62 }
const related = [...chain.members, sibling]
const inLine = new Set(chain.members.map((m) => m.n))

const step = (i, m) => (m.state === 'approved' ? `<span class="step done">${ICON.check}</span>` : `<span class="step">${i}</span>`)
const box = (on, dis = false) => `<span class="box ${on ? 'on' : ''} ${dis ? 'dis' : ''}">${on ? ICON.check : ''}</span>`
const you = (m) => (m.rs.find((r) => r[0] === 'Alice')?.[2] ? `<span class="chip pos">Alice ${m.rs.find((r) => r[0] === 'Alice')[2]}</span>` : m.state === 'needs-review' ? '<span class="chip pending">Alice</span>' : '')

const CSS_LIST = `
.seq-list { display: flex; flex-direction: column; gap: 2px; }
.seq-row { display: flex; gap: 8px; align-items: center; padding: 5px 8px; border-radius: 5px; font-size: 13px; white-space: nowrap; }
.seq-row.on { background: var(--panel); }
.seq-row.off { color: var(--muted); }
.seq-row.off .step { border-style: dashed; }
.seq-row .n { font-weight: 600; color: var(--fg); }
.seq-row .subj { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.seq-row .badge { font-size: 10.5px; }
.seq-row.sib { margin-left: 22px; }
.seq-row .hint { font-size: 11.5px; color: var(--muted); }
.box { width: 15px; height: 15px; border: 1.5px solid var(--muted); border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; color: #fff; }
.box.on { background: var(--accent); border-color: var(--accent); }
.box.dis { opacity: 0.4; }
.box svg { width: 10px; height: 10px; }
.seq-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }
.seq-foot .btn { padding: 5px 12px; font-size: 13px; }
.seq-foot .spacer { flex: 1; }
.seq-foot .link { color: var(--neg); font-size: 12px; }
.name { display: flex; gap: 8px; align-items: center; font-size: 12.5px; margin: 0 0 8px; }
.name input { flex: 1; font: inherit; font-size: 13px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); }
.name .lbl { font-weight: 600; white-space: nowrap; }
.sub { font-size: 12px; color: var(--muted); margin: 0 0 8px; }
h4.seq-h { margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 700; }
`

const listRows = (checked = inLine, { detail = false } = {}) =>
  related
    .map((m, i) => {
      const on = checked.has(m.n)
      const sib = m === sibling
      return `<div class="seq-row ${on ? 'on' : 'off'} ${sib ? 'sib' : ''}">${box(on)}${sib ? '' : step(i + 1, m)}<span class="n">#${m.n}</span><span class="subj">${m.subject}</span>${detail ? you(m) : ''}<span class="badge ${m.state}">${LABEL[m.state]}</span>${sib ? '<span class="hint">also built on #62</span>' : ''}</div>`
    })
    .join('')

// --- 1. Popover checklist, anchored to the opener -----------------------------

const css1 = CSS_LIST + `
.menu.seq-pop { position: absolute; top: calc(100% + 4px); right: 0; width: 520px; padding: 10px; z-index: 40; white-space: normal; }
`
const pop1 = `<div class="menu seq-pop"><h4 class="seq-h">Sequence on <code>master</code> · demo</h4><p class="sub">Tick the changes reviewers should see as one card, in this order. Gerrit sets the order from the parents.</p><div class="seq-list">${listRows()}</div><div class="seq-foot"><span>4 of 5 related changes</span><span class="spacer"></span><span class="btn">Cancel</span><span class="btn primary">Save sequence</span></div></div>`
const body1 = todayCards((m) => (m.n === 62 ? { wipCell: `<div class="split flags-menu" style="position:relative"><span class="btn subtle split-main">Mark WIP</span><span class="btn subtle split-caret">▾</span>${pop1}</div>` } : {}))
const note1 = `<b>1 · Popover checklist.</b> The same surface as the add-reviewer popover: a menu anchored to the opener, with every related change as a checkbox row, base first, and one Save. The sibling #65, which also builds on #62 but is not in the line, is listed indented and unticked so the owner sees why it is not offered a step. Small and familiar, and stays in the flow of the card. The list has no room for reviewers or actions, and a long chain scrolls.`

// --- 2. Dialog with a live preview ---------------------------------------------

const css2 = CSS_LIST + `
.backdrop { position: fixed; inset: 0; background: #0005; z-index: 50; display: flex; align-items: center; justify-content: center; }
.dlg { width: 880px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; box-shadow: 0 10px 40px #0004; }
.dlg h3 { margin: 0 0 4px; font-size: 16px; }
.dlg .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 12px; }
.dlg .prev { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--panel); }
.dlg .prev .ph { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; margin-bottom: 6px; }
.dlg .prev .ph .subject { font-size: 14px; }
.dlg .prev .pr { display: flex; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--border); font-size: 12.5px; }
.dlg .prev .pr .subj { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dlg .prev .pr .badge { font-size: 10.5px; }
.dlg .prev .pr.dim { color: var(--muted); }
`
const preview2 = `<div class="prev"><h4 class="seq-h">Preview · as reviewers see it</h4><div class="ph"><span class="badge chain">${ICON.chain} 4 in sequence</span><span class="subject">settings-table</span><span class="badge branch">master</span><span class="badge tally approved">1 Approved</span><span class="badge tally needs-review">2 Needs Review</span></div>${chain.members.map((m, i) => `<div class="pr ${m.state === 'needs-review' ? '' : 'dim'}">${step(i + 1, m)}<span class="subj">${m.subject}</span><span class="badge ${m.state}">${LABEL[m.state]}</span></div>`).join('')}</div>`
const dlg2 = `<div class="backdrop"><div class="dlg"><h3>Sequence on <code>master</code></h3><p class="sub">Reviewers see the ticked changes as one card, in order, and are pointed at the lowest one that waits on them. The requests, votes and buttons stay per change.</p><div class="cols"><div><div class="name"><span class="lbl">Name</span><input value="settings-table"><span class="muted">from the topic</span></div><div class="seq-list">${listRows()}</div></div>${preview2}</div><div class="seq-foot"><span class="link">Remove sequence</span><span class="spacer"></span><span class="btn">Cancel</span><span class="btn primary">Save</span></div></div></div>`
const body2 = todayCards() + dlg2
const note2 = `<b>2 · Dialog with a preview.</b> A centred dialog, as the vote dialog is: the checklist and a name on the left, a live preview of the chain card on the right, so the owner sees what reviewers will get before saving. Room for a name (prefilled from the topic) and a "Remove sequence" way out. Heavier than a popover, and it covers the board, but it is the only design that shows the result before it is written.`

// --- 3. Side drawer with chain-wide actions -------------------------------------

const css3 = CSS_LIST + `
.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 460px; background: var(--bg); border-left: 1px solid var(--border); box-shadow: -8px 0 30px #0003; z-index: 50; padding: 16px 18px; overflow: auto; }
.drawer h3 { margin: 0 0 2px; font-size: 16px; display: flex; gap: 8px; align-items: center; }
.drawer h3 .x { margin-left: auto; color: var(--muted); font-size: 18px; }
.drawer .seq-row { flex-wrap: wrap; }
.drawer .seq-row .subj { flex-basis: 100%; order: 5; padding-left: 51px; font-size: 12px; color: var(--muted); white-space: normal; }
.drawer .seq-row .chip { font-size: 11px; padding: 1px 7px; }
.drawer .acts { margin-top: 14px; }
.drawer .act { display: flex; gap: 10px; align-items: center; padding: 7px 8px; border: 1px solid var(--border); border-radius: 6px; margin-top: 6px; font-size: 13px; }
.drawer .act .muted { font-size: 12px; }
.drawer .act .btn { margin-left: auto; padding: 3px 10px; font-size: 12.5px; }
.drawer .seq-foot { position: sticky; bottom: 0; background: var(--bg); padding-bottom: 4px; }
.mock-note { max-width: 700px; }
`
const drawer3 = `<div class="drawer"><h3>${ICON.chain.replace('<svg', '<svg width="16" height="16"')} Sequence on <code>master</code><span class="x">×</span></h3><p class="sub">demo · settings-table · 5 related changes</p>
<div class="name"><span class="lbl">Name</span><input value="settings-table"></div>
<h4 class="seq-h">In the sequence</h4><div class="seq-list">${listRows(inLine, { detail: true })}</div>
<div class="acts"><h4 class="seq-h">For every change in the sequence</h4>
<div class="act"><span>Request review</span><span class="muted">#64 is not yet asked</span><span class="btn">Request 1</span></div>
<div class="act"><span>Add a primary reviewer</span><span class="muted">to all four</span><span class="btn">+ reviewer</span></div>
<div class="act"><span>Mark active</span><span class="muted">#63, #64 are WIP</span><span class="btn">Mark 2 active</span></div>
</div>
<div class="seq-foot"><span class="link">Remove sequence</span><span class="spacer"></span><span class="btn">Cancel</span><span class="btn primary">Save</span></div></div>`
const body3 = todayCards() + drawer3
const note3 = `<b>3 · Side drawer.</b> A panel from the right edge, the board still visible beside it. The checklist shows each change with your reviewers' state, and below it a block of actions that act on every change in the sequence at once: request review of the ones not yet asked, add a primary reviewer to all, mark all active. The drawer is the one design with room for chain-wide actions, which is what an owner of a four-change stack does most. It is also the largest surface, and the actions widen the feature past "which changes are in it".`

// --- 4. The chain card edits itself --------------------------------------------

const css4 = CSS_LIST + `
.change.editing { border-color: var(--accent); box-shadow: 0 0 0 2px var(--pending-bg); }
.change.editing .change-head { align-items: center; }
.change.editing .name { margin: 0; flex: 0 0 auto; }
.change.editing .name input { width: 200px; }
.change.editing .ed-btns { margin-left: auto; display: flex; gap: 6px; }
.change.editing .ed-btns .btn { padding: 3px 10px; font-size: 12.5px; }
.change.editing .c-branch { gap: 8px; }
.change.editing .change-row.excl > .cell { color: var(--muted); background: repeating-linear-gradient(135deg, transparent 0 6px, var(--panel) 6px 8px); }
.change.editing .change-row.excl .subj { text-decoration: none; }
.change.editing .change-row.sib > .cell.c-branch { padding-left: 22px; }
.chain .c-branch { max-width: 300px; }
`
const editRows = related
  .map((m, i) => {
    const on = inLine.has(m.n)
    const sib = m === sibling
    const first = `${box(on)}${sib ? '' : step(i + 1, m)}<span class="link subj">${m.subject}</span>`
    return row(m, { first, dim: !on }).replace('class="change-row', `class="change-row ${on ? '' : 'excl'} ${sib ? 'sib' : ''}`)
  })
  .join('')
const editing4 = `<li class="change chain editing state-needs-review">
<div class="change-head"><span class="badge chain">${ICON.chain} sequence</span><span class="name"><span class="lbl">Name</span><input value="settings-table"></span><span class="badge branch">master</span><span class="muted small">Tick the changes reviewers see as one card</span><span class="ed-btns"><span class="link" style="color:var(--neg);font-size:12px;margin-right:8px">Remove</span><span class="btn">Cancel</span><span class="btn primary">Done</span></span></div>
${editRows}</li>`
const body4 = [section('Approved', 1, card(chain.members[0], chain)), section('Out for review', 3, editing4 + card(single, single)), section('In progress, review not requested', 1, card(chain.members[3], chain))].join('')
const note4 = `<b>4 · The chain card edits itself.</b> No new surface: opening the manager turns the chain card (or, for an untagged set, a provisional one) into an editor in place. A checkbox appears before each step, the related changes that are not in the line are added as struck rows, the name becomes a field, and Done writes the tags. Everything else on the row stays live, so the owner edits the sequence with the reviewers, states and buttons in view. It puts an editing state on the busiest component on the board, and a provisional card for an untagged set moves the four cards while editing.`

// --- 5. Path picker over the relation tree ------------------------------------

const css5 = CSS_LIST + `
.backdrop { position: fixed; inset: 0; background: #0005; z-index: 50; display: flex; align-items: center; justify-content: center; }
.dlg { width: 900px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 18px 20px; box-shadow: 0 10px 40px #0004; }
.dlg h3 { margin: 0 0 4px; font-size: 16px; }
.dlg .cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; margin-top: 12px; }
.dlg .cols > * { min-width: 0; }
.seq-row { overflow: hidden; }
.tree { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; background: var(--panel); }
.tree .node { display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 5px; font-size: 13px; white-space: nowrap; position: relative; }
.tree .node .n { font-weight: 600; }
.tree .node .subj { overflow: hidden; text-overflow: ellipsis; }
.tree .node .badge { font-size: 10.5px; margin-left: auto; }
.tree .node.picked { background: var(--pending-bg); }
.tree .node.picked .dot { background: var(--accent); border-color: var(--accent); }
.tree .node.tip { outline: 2px solid var(--accent); }
.tree .dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--muted); background: var(--bg); flex: 0 0 auto; }
.tree .kids { margin-left: 12px; padding-left: 14px; border-left: 2px solid var(--border); }
.tree .kids.fork { position: relative; }
.tree .fork-note { font-size: 11.5px; color: var(--muted); margin: 4px 0 2px 6px; }
.tree .legend { font-size: 11.5px; color: var(--muted); margin-top: 8px; }
`
const node = (m, { picked = false, tip = false } = {}) => `<div class="node ${picked ? 'picked' : ''} ${tip ? 'tip' : ''}"><span class="dot"></span><span class="n">#${m.n}</span><span class="subj">${m.subject}</span><span class="badge ${m.state}">${LABEL[m.state]}</span></div>`
const [c61, c62, c63, c64] = chain.members
const tree5 = `<div class="tree"><h4 class="seq-h">Related changes on <code>master</code></h4>
${node(c61, { picked: true })}<div class="kids">${node(c62, { picked: true })}<div class="kids fork"><div class="fork-note">#62 has two children; pick the tip of the line you want</div>${node(c63, { picked: true })}<div class="kids">${node(c64, { picked: true, tip: true })}</div>${node(sibling)}</div></div>
<div class="legend">Click a change to make it the tip. The sequence is every change from the base to the tip.</div></div>`
const picked5 = `<div><h4 class="seq-h">Sequence · base to tip</h4><div class="seq-list">${chain.members.map((m, i) => `<div class="seq-row on">${step(i + 1, m)}<span class="n">#${m.n}</span><span class="subj">${m.subject}</span>${you(m)}<span class="badge ${m.state}">${LABEL[m.state]}</span></div>`).join('')}</div><p class="sub" style="margin-top:8px">#65 is off this line and stays an ordinary card.</p><div class="name" style="margin-top:12px"><span class="lbl">Name</span><input value="settings-table"></div></div>`
const dlg5 = `<div class="backdrop"><div class="dlg"><h3>Sequence on <code>master</code></h3><p class="sub">A sequence is one line through the related changes: from the base to a tip you pick. Where the line forks, choose which branch reviewers follow.</p><div class="cols">${tree5}${picked5}</div><div class="seq-foot"><span class="link">Remove sequence</span><span class="spacer"></span><span class="btn">Cancel</span><span class="btn primary">Save</span></div></div></div>`
const body5 = todayCards() + dlg5
const note5 = `<b>5 · Path picker.</b> The related changes drawn as the tree Gerrit reports, and the owner picks a tip; the sequence is the whole line from the base to it. That fits what a sequence is, one path through the parents, and it is the only design that handles a fork honestly: when #62 has two children the owner chooses which line reviewers follow, rather than ticking boxes that could describe no line at all. The right column shows the result. It is a dialog, and the tree is a new drawing for the board to learn; for a chain with no fork it is a checklist with extra ceremony.`

const pages = [
  ['1-popover-checklist', '1 Popover checklist', css1, body1, note1],
  ['2-dialog-preview', '2 Dialog with a preview', css2, body2, note2],
  ['3-side-drawer', '3 Side drawer', css3, body3, note3],
  ['4-inline-edit', '4 The chain card edits itself', css4, body4, note4],
  ['5-path-picker', '5 Path picker', css5, body5, note5],
]
for (const [file, title, css, body, note] of pages) {
  writeFileSync(path.join(here, `${file}.html`), page(title, css, body, note))
  console.log('wrote', file + '.html')
}
