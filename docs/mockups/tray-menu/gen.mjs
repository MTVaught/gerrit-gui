// Writes the five mockup pages. All show the same data for Alice: three
// changes need her review (two singles and one family), one family needs
// changes, one family is approved, and Dave asked her to merge one change.
import fs from 'node:fs'

const menubar = `<div class="menubar"><span class="apple">&#63743;</span><span class="app">Finder</span><span>File</span><span>Edit</span><span>View</span><span>Go</span><span>Window</span><span>Help</span>
<div class="right"><span class="strip active"><span class="pill review">3</span><span class="pill fix">1</span><span class="pill ready">1</span><span class="pill merge">1</span></span><span>&#9889;</span><span>Wed 10:42</span></div></div>`

const boardWin = `<div class="board-win"><div class="titlebar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:auto;margin-right:auto;color:#6b7280;font-size:12px">Gerrit Review Board</span></div>
<div class="tabs"><b>Needs Review 3</b><span>Reviewing 5</span><span>My Changes 4</span><span>Merged 2</span><span>Team Reviews 6</span></div>
<div class="line"></div><div class="line w"></div><div class="line"></div><div class="line w"></div><div class="line"></div>
<div class="win-note">The board stays where it was, behind whatever you were working in.<br>The tray click only opens the menu.</div></div>`

const tail = `<div class="sep"></div>
<div class="mi"><span class="txt">Open board</span></div>
<div class="mi"><span class="txt">Refresh now</span></div>
<div class="mi"><span class="check">&#10003;</span><span class="txt">Compact window</span></div>
<div class="mi"><span class="txt">Compact window stays on top</span></div>
<div class="sep"></div>
<div class="mi dis"><span class="txt">Version 0.1.0, build add67ac</span></div>
<div class="mi"><span class="txt">Check for updates</span></div>
<div class="mi"><span class="txt">Quit</span></div>`

function page(title, body, note, desk = "desk") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<link rel="stylesheet" href="mock.css"></head><body>
<div class="${desk}">${menubar}${boardWin}${body}</div>
<p class="mock-note">${note}</p>
</body></html>`
}

const MENU_LEFT = 700, MENU_TOP = 27
const cat = (cls, label, n, extra = '') => `<div class="mi ${extra}"><span class="dotc ${cls}"></span><span class="txt">${label}</span><span class="sub">${n}</span><span class="arrow">&#9656;</span></div>`

// ---------- 1: submenu per section, one row per branch ----------
const v1 = page('Tray menu: submenu, row per branch', `
<div class="menu" style="left:${MENU_LEFT}px;top:${MENU_TOP}px">
${cat('review', 'Needs Review', 3, 'hi')}
${cat('fix', 'Needs Changes', 1)}
${cat('ready', 'Approved', 1)}
${cat('merge', 'Ready to Merge', 1)}
${tail}</div>
<div class="menu wider" style="left:${MENU_LEFT - 380 + 6}px;top:${MENU_TOP}px">
<div class="mi"><span class="txt">#41 Retry on 502 from the artifact store</span><span class="sub">master &middot; Bob</span></div>
<div class="mi"><span class="txt">#38 Cap the log line length</span><span class="sub">release-2.0 &middot; Carol</span></div>
<div class="mi hi"><span class="txt">#44 Rotate the API keys nightly</span><span class="sub">master &middot; Bob</span></div>
<div class="mi"><span class="txt">#45 Rotate the API keys nightly</span><span class="sub">release-2.0 &middot; Bob</span></div>
<div class="sep"></div>
<div class="mi"><span class="txt">Open the Needs Review tab</span></div>
</div>`,
`<b>1 &middot; Submenu, one row per branch.</b> Each section row stays as it is, with the count, and gains a submenu (a plain Electron <code>submenu</code>, no custom window). The submenu lists every change in the section, one row per Gerrit change, with the number, the subject and the branch and owner in grey. A family is not special: its branches are adjacent rows that repeat the subject. Clicking a row opens that change in the browser. The last row opens the tab in the board, which is what the section row itself does today. Cost: the pill says 3 but the submenu has 4 rows, because a family counts once on the pill and the tabs.`)

// ---------- 2: submenu per section, family row with nested submenu ----------
const v2 = page('Tray menu: submenu, nested family', `
<div class="menu" style="left:${MENU_LEFT}px;top:${MENU_TOP}px">
${cat('review', 'Needs Review', 3, 'hi')}
${cat('fix', 'Needs Changes', 1)}
${cat('ready', 'Approved', 1)}
${cat('merge', 'Ready to Merge', 1)}
${tail}</div>
<div class="menu wider" style="left:${MENU_LEFT - 380 + 6}px;top:${MENU_TOP}px">
<div class="mi"><span class="txt">#41 Retry on 502 from the artifact store</span><span class="sub">master &middot; Bob</span></div>
<div class="mi"><span class="txt">#38 Cap the log line length</span><span class="sub">release-2.0 &middot; Carol</span></div>
<div class="mi hi"><span class="txt">Rotate the API keys nightly</span><span class="sub">3 branches &middot; Bob</span><span class="arrow">&#9656;</span></div>
<div class="sep"></div>
<div class="mi"><span class="txt">Open the Needs Review tab</span></div>
</div>
<div class="menu" style="left:${MENU_LEFT - 380 + 6 - 268 + 6}px;top:${MENU_TOP + 5 + 22 * 2}px">
<div class="mi hi"><span class="txt"><code>master</code></span><span class="sub">#44 &middot; asked 2h ago</span></div>
<div class="mi"><span class="txt"><code>release-2.0</code></span><span class="sub">#45 &middot; asked 2h ago</span></div>
<div class="mi dis"><span class="txt"><code>release-1.0</code></span><span class="sub">#43 &middot; you voted +1</span></div>
</div>`,
`<b>2 &middot; Submenu, family as a nested submenu.</b> As design 1, but a family is one row, so the submenu has as many rows as the pill says. The row shows the subject once and "3 branches" in grey, and opens a third-level submenu with one row per branch: the branch name, the change number and why it is here. Branches that do not need the action (here <code>release-1.0</code>, already voted on) are listed greyed out, so the family reads whole, as its card does on the board. Clicking a branch opens that change. Cost: two hovers to reach a branch, and three-deep menus are rare on macOS.`)

// ---------- 3: inline accordion in the native menu ----------
const v3 = page('Tray menu: inline accordion', `
<div class="menu wider" style="left:${MENU_LEFT - 112}px;top:${MENU_TOP}px">
<div class="mi head"><span class="dotc review"></span><span class="txt">&#9662;&nbsp; Needs Review</span><span class="sub">3</span></div>
<div class="mi indent"><span class="txt">#41 Retry on 502 from the artifact store</span><span class="sub">master &middot; Bob</span></div>
<div class="mi indent"><span class="txt">#38 Cap the log line length</span><span class="sub">release-2.0 &middot; Carol</span></div>
<div class="mi indent dis"><span class="txt">Rotate the API keys nightly</span><span class="sub">Bob</span></div>
<div class="mi indent2 hi"><span class="tree">&#9492;</span><span class="txt"><code>master</code></span><span class="sub">#44</span></div>
<div class="mi indent2"><span class="tree">&#9492;</span><span class="txt"><code>release-2.0</code></span><span class="sub">#45</span></div>
<div class="mi indent2 dis"><span class="tree">&#9492;</span><span class="txt"><code>release-1.0</code></span><span class="sub">#43 &middot; you voted +1</span></div>
<div class="mi head"><span class="dotc fix"></span><span class="txt">&#9656;&nbsp; Needs Changes</span><span class="sub">1</span></div>
<div class="mi head"><span class="dotc ready"></span><span class="txt">&#9656;&nbsp; Approved</span><span class="sub">1</span></div>
<div class="mi head"><span class="dotc merge"></span><span class="txt">&#9656;&nbsp; Ready to Merge</span><span class="sub">1</span></div>
${tail}</div>`,
`<b>3 &middot; Inline accordion in the native menu.</b> Still an Electron menu, one level deep. Each section row carries a disclosure triangle; clicking it flips the section open or closed, the app rebuilds the menu and pops it straight back up (<code>tray.popUpContextMenu()</code>), so it feels like it never closed. The open state is remembered. Open sections list their changes indented under the header. A family is a subject line that is a label only, with a branch line under it for each branch; branches that do not need the action are greyed out. Clicking a change or a branch opens it in the browser. Cost: the menu gets tall when several sections are open, and the reopen after a toggle flickers on some platforms; the section row no longer opens the board tab (that moves to a row at the end of each section, or to the "Open board" row).`)

// ---------- 4: custom popover with disclosure sections ----------
const POP_LEFT = MENU_LEFT - 120, POP_TOP = 34
const secClosed = (cls, name, n) => `<div class="sec"><div class="sec-h"><span class="tri">&#9654;</span><span class="name">${name}</span><span class="pill ${cls}">${n}</span><span class="go">tab &#8599;</span></div></div>`
const ftr = `<div class="ftr"><span class="b">Open board</span><span class="b">Refresh</span><span class="b">&#9881;</span><span class="sp"></span><span class="ver">0.1.0 &middot; add67ac &middot; updated 1m ago</span></div>`
const v4 = page('Tray popover: sections and family cards', `
<div class="pop arr-right" style="left:${POP_LEFT}px;top:${POP_TOP}px">
<div class="sec"><div class="sec-h"><span class="tri">&#9660;</span><span class="name">Needs Review</span><span class="pill review">3</span><span class="go">tab &#8599;</span></div>
<div class="rows">
<div class="row"><div class="main"><span class="subj">Retry on 502 from the artifact store</span><span class="meta">#41 &middot; <code>master</code> &middot; Bob &middot; asked 2h ago</span></div><span class="ext">&#8599;</span></div>
<div class="row"><div class="main"><span class="subj">Cap the log line length</span><span class="meta">#38 &middot; <code>release-2.0</code> &middot; Carol &middot; asked 1d ago</span></div><span class="ext">&#8599;</span></div>
<div class="fam"><div class="fam-h"><span class="fork">&#8916;</span>Rotate the API keys nightly<span class="meta">Bob &middot; 3 branches</span></div>
<div class="br hov"><code>master</code><span class="st review">#44 &middot; asked 2h ago &#8599;</span></div>
<div class="br"><code>release-2.0</code><span class="st review">#45 &middot; asked 2h ago</span></div>
<div class="br other"><code>release-1.0</code><span class="st">#43 &middot; you voted +1</span></div>
</div></div></div>
${secClosed('fix', 'Needs Changes', 1)}
${secClosed('ready', 'Approved', 1)}
${secClosed('merge', 'Ready to Merge', 1)}
${ftr}</div>`,
`<b>4 &middot; Popover window with disclosure sections.</b> The tray click opens a small frameless window under the icon instead of a native menu, as 1Password or Dropbox do. Every section is a header with a triangle, the count in the colour of its pill, and a "tab" link that opens the board on that tab; clicking the header opens or closes the section in place, without the panel closing. Singles are two-line rows (subject, then number, branch, owner, age). A family is a small card, as on the board: the subject once, then a line per branch with its number and its reason for being here, greyed when the branch does not need the action. Clicking a row or a branch line opens that change in the browser. The footer holds what is under the separator in today's menu. Cost: a second window to build and keep in sync, the panel must close on outside clicks and on Escape, and it does not look like the other menus in the menu bar.`)

// ---------- 5: popover ledger, one line per family with branch chips ----------
const v5 = page('Tray popover: ledger with branch chips', `
<div class="pop arr-right" style="left:${POP_LEFT}px;top:${POP_TOP}px">
<div class="sec"><div class="sec-h"><span class="tri">&#9660;</span><span class="name">Needs Review</span><span class="pill review">3</span><span class="go">tab &#8599;</span></div>
<div class="rows">
<div class="row"><div class="main"><span class="subj">Retry on 502 from the artifact store</span><span class="meta">#41 &middot; <code>master</code> &middot; Bob</span></div><span class="age">2h</span></div>
<div class="row"><div class="main"><span class="subj">Cap the log line length</span><span class="meta">#38 &middot; <code>release-2.0</code> &middot; Carol</span></div><span class="age">1d</span></div>
<div class="row"><div class="main"><span class="subj">Rotate the API keys nightly</span><span class="chips"><span class="chip review hov">master #44</span><span class="chip review">release-2.0 #45</span><span class="chip other">release-1.0 &#10003;</span></span></div><span class="age">2h</span></div>
</div></div>
<div class="sec"><div class="sec-h"><span class="tri">&#9660;</span><span class="name">Needs Changes</span><span class="pill fix">1</span><span class="go">tab &#8599;</span></div>
<div class="rows">
<div class="row"><div class="main"><span class="subj">Speed up the index rebuild</span><span class="chips"><span class="chip fix">master #17</span><span class="chip fix">release-2.0 #18</span></span></div><span class="age">3d</span></div>
</div></div>
<div class="sec"><div class="sec-h"><span class="tri">&#9660;</span><span class="name">Approved</span><span class="pill ready">1</span><span class="go">tab &#8599;</span></div>
<div class="rows">
<div class="row"><div class="main"><span class="subj">Allow uploads over 2 GB</span><span class="chips"><span class="chip ready">master #22</span><span class="chip other">release-1.0 &middot; out for review</span><span class="chip ready">release-2.0 #24</span></span></div><span class="age">5h</span></div>
</div></div>
<div class="sec"><div class="sec-h"><span class="tri">&#9660;</span><span class="name">Ready to Merge</span><span class="pill merge">1</span><span class="go">tab &#8599;</span></div>
<div class="rows">
<div class="row"><div class="main"><span class="subj">Drop the legacy TOML loader</span><span class="meta">#25 &middot; <code>release-1.0</code> &middot; Dave asked you &middot; merged on <code>master</code></span></div><span class="age">20m</span></div>
</div></div>
${ftr}</div>`,
`<b>5 &middot; Popover ledger, one line per family with branch chips.</b> The same popover window as design 4, but every section starts open and every change or family is exactly one line, so the panel is as short as it can be and the line count matches the pills. A single change has its branch in the grey line. A family has a chip per branch, coloured by the section it is in, grey when the branch does not need the action (a tick for "you already voted", or its state in words). Clicking a chip opens that branch; clicking the line elsewhere opens the first chip. Sections still collapse from the header. Cost: chips make a line two lines tall anyway, three long branch names wrap, and the chip is a small target.`, 'desk tall')

const out = { '1-submenu-per-branch': v1, '2-submenu-nested-family': v2, '3-inline-accordion': v3, '4-popover-sections': v4, '5-popover-chips': v5 }
for (const [name, html] of Object.entries(out)) fs.writeFileSync(new URL(`./${name}.html`, import.meta.url), html)
console.log('wrote', Object.keys(out).join(', '))
