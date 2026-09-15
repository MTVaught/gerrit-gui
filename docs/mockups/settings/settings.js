// Shared pieces for the settings mockups: the icons of the app, the one-row
// top bar, and the settings sections. Each page composes these differently.
const SVG = (d, extra = '') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`
const I = {
  refresh: SVG('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  shrink: SVG('<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>'),
  expand: SVG('<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>'),
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  sliders: SVG('<path d="M4 7h9"/><path d="M17 7h3"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>', 'width="14" height="14"'),
  check: SVG('<path d="m5 12 4 4L19 6"/>', 'width="12" height="12" stroke-width="3"'),
  x: SVG('<path d="M6 6l12 12M18 6L6 18"/>', 'width="12" height="12"'),
  ext: SVG('<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v7H4V6h7"/>', 'width="13" height="13"'),
  chev: SVG('<path d="m6 9 6 6 6-6"/>', 'width="12" height="12"'),
  lock: SVG('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 'width="13" height="13"'),
  plug: SVG('<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>', 'width="14" height="14"'),
  user: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 'width="14" height="14"'),
}
const TABS_FULL = [['Needs Review', 1, true], ['Reviewing', 25], ['My Changes', 2], ['Ready to Merge', 3], ['Recently Merged', 17], ['Team Reviews', 4], ['External Reviews', 1]]
const TABS_SHORT = [['To review', 1, true], ['Reviewing', 25], ['Mine', 2], ['Ready', 3], ['Merged', 17], ['Team', 4], ['External', 1]]

function tabStrip(list, active, extra = '') {
  return `<nav class="tabs">${list.map(([l, n, hot]) => `<button class="tab${l === active ? ' active' : ''}">${l} <span class="count${hot ? ' hot' : ''}">${n}</span></button>`).join('')}${extra}</nav>`
}
/**
 * The one-row top bar: tabs, then the controls. `o.settings` is how the gear
 * shows: 'tab' (a tab at the end of the strip), 'icon' (an icon button that
 * lights up while open) or 'none'; `o.active` is the selected tab.
 */
function topbar(o) {
  o = { compact: false, active: 'Reviewing', settings: 'icon', open: false, right: '', view: true, status: true, ...o }
  const list = o.compact ? TABS_SHORT : TABS_FULL
  const gearTab = o.settings === 'tab' ? `<button class="tab gear${o.open ? ' active' : ''}" title="Settings" aria-label="Settings">${I.gear}${o.open ? ' Settings' : ''}</button>` : ''
  const gearBtn = o.settings === 'icon' ? `<button class="btn icon${o.open ? ' on' : ''}" title="Settings">${I.gear}</button>` : ''
  const view = o.view ? `<button class="btn icon" title="View: search, filter, sort">${I.sliders} ${I.chev}</button>` : ''
  const compactBtn = o.compact ? `<button class="btn icon active" title="Back to the full window">${I.expand}</button>` : `<button class="btn icon" title="Compact window">${I.shrink}</button>`
  const refresh = `<button class="btn icon" title="Refresh · updated 2 minutes ago">${I.refresh}</button>`
  const status = o.status && o.compact ? `<span class="muted status-line">updated 2m ago</span>` : ''
  return `<header class="topbar">${tabStrip(list, o.active, o.compact ? '' : gearTab)}<div class="topbar-right">${status}${view}${refresh}${compactBtn}${o.compact && o.settings === 'tab' ? `<button class="tab gear${o.open ? ' active' : ''}" title="Settings">${I.gear}</button>` : gearBtn}${o.right}</div></header>`
}

// Settings sections. `saved` marks the control that was just changed, to
// show the instant-apply feedback of the design.
const SAVED = `<span class="saved">${I.check} Saved</span>`
function chips(names) { return names.map((n) => `<span class="chip member">${n}<button class="chip-x">×</button></span>`).join('') }
function teamSection(o = {}) {
  return `<h2>Team</h2><p class="muted">The team decides where a change is listed. Changes owned by the team are on the regular tabs and on <b>Team Reviews</b>; changes owned by people outside the team are on <b>External Reviews</b> only. Leave the list empty to hide the two tabs.</p>
<div class="team-members">${chips(o.members ?? ['alice', 'bob', 'carol', 'dave'])}${o.saved ? SAVED : ''}</div>
<div class="team-add"><span class="field${o.focus ? ' focus' : ''}"><span class="ph">Username or email</span></span><button class="btn" disabled>Add</button></div>
<p class="muted small">Usernames or email addresses. You are always on the team. Start typing to pick from the accounts on the server.</p>`
}
function mergersSection(o = {}) {
  return `<h2>Mergers</h2><p class="muted">Who to offer when you ask for a merge. The <b>Ready to Merge</b> button lists the people set for the project of the change, most specific row first.</p>
<div class="rule"><div class="head"><span class="field"><code>*</code></span><button class="btn subtle">Remove</button></div><div class="team-members" style="margin-top:8px">${chips(['Dave'])}</div><div class="team-add"><span class="field"><span class="ph">Username or email</span></span><button class="btn" disabled>Add</button></div></div>
<div class="rule"><div class="head"><span class="field"><code>platform/*</code></span><button class="btn subtle">Remove</button></div><div class="team-members" style="margin-top:8px">${chips(['Carol', 'Bob'])}</div><div class="team-add"><span class="field"><span class="ph">Username or email</span></span><button class="btn" disabled>Add</button></div></div>
<div class="row"><button class="btn">Add project</button></div>
<p class="muted small">A project is an exact name, a prefix ending in <code>*</code>, or <code>*</code> alone for every project.</p>`
}
function check(label, on, o = {}) {
  const dis = o.disabled ? ' disabled' : ''
  return `<label class="check"><input type="checkbox"${on ? ' checked' : ''}${dis}> ${label}${o.saved ? SAVED : ''}</label>`
}
function sw(label, on, o = {}) {
  return `<label class="switch"><span class="sw${on ? ' on' : ''}${o.disabled ? ' dim' : ''}"></span>${label}${o.saved ? SAVED : ''}</label>`
}
function appIconSection(ctl = check, o = {}) {
  return `<h2>App icon</h2>${ctl('Show the total as a badge on the app icon', true, { saved: o.saved === 'badge' })}<p class="muted small">The Dock on macOS, the launcher on Linux and the taskbar on Windows.</p>`
}
function windowSection(ctl = check, o = {}) {
  return `<h2>Window</h2>${ctl('Compact window stays on top', true, { saved: o.saved === 'top' })}<p class="muted small">The compact window floats above other windows and follows you to every workspace. The full-size window is never pinned.</p>`
}
function menubarSection(ctl = check, o = {}) {
  return `<h2>Menu bar</h2>${ctl('Show counts on the menu bar icon', true, { saved: o.saved === 'counts' })}<p class="muted small">Off, the menu bar keeps the plain icon. The tooltip and the menu still list what waits on you.</p>
${ctl('Show glyphs instead of colored counts', o.glyph ?? false, { saved: o.saved === 'glyph' })}<p class="muted small">One colored count per category: Needs Review, Needs Changes, Approved, Ready to Merge. Glyphs (◉ ✎ ◆ ⇧) replace the colors if you cannot tell them apart.</p>
${ctl('Always show Needs Review, Needs Changes and Approved, even at zero', false)}<p class="muted small">Keeps those counts in place so their position never changes.</p>`
}
function projectsSection(o = {}) {
  return `<h2>Scope</h2><label>Projects to watch for WIP reviews (optional)<span class="field block">platform/*, tools/build</span></label><p class="muted small">Gerrit cannot search for WIP changes by reviewer, so the app scans open WIP changes in these projects. Empty scans all projects. A change here refreshes the board.</p>`
}
function aboutSection() {
  return `<h2>About</h2><p>Gerrit Review Board 0.9.2. <span class="muted">Up to date · Last checked 2 hours ago</span></p><div class="row"><button class="btn" disabled>Check for updates</button><button class="btn">Release notes</button></div>`
}
/** The connection form, on its own now: URL, username, password, one Test button. */
function connectionForm(o = {}) {
  return `<label>Server URL<span class="field block">https://gerrit.example.com/gerrit1</span></label>
<label>Username<span class="field block">alice</span></label>
<label>HTTP password<span class="field block"><span class="ph">${o.hasPassword === false ? '' : '(unchanged)'}</span></span></label>
<p class="muted small">Generate an HTTP password in Gerrit under Settings, HTTP Credentials. It is stored encrypted with the OS keychain.</p>`
}
function connectionSummary(o = {}) {
  return `<div class="conn"><span class="dot"></span><span><span class="who">alice</span> <span class="muted">on gerrit.example.com/gerrit1 · connected</span></span><button class="btn">${o.label ?? 'Change connection…'}</button></div>`
}
