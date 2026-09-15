// Writes the five pages. Run: node docs/mockups/mine-pill/gen.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))

const LOCK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>'
// Counts on My Changes, in section order. Sum = total.
const STATES = [
  { name: '2 need changes · 3 approved · 5 out for review · 6 in progress · 3 private', c: { fix: 2, ok: 3, rev: 5, wip: 6, priv: 3 } },
  { name: 'Nothing waits on me: 4 out for review · 8 in progress · 1 private', c: { fix: 0, ok: 0, rev: 4, wip: 8, priv: 1 } },
  { name: 'Only work in progress: 3 in progress', c: { fix: 0, ok: 0, rev: 0, wip: 3, priv: 0 } },
]
const LABEL = { fix: 'need changes', ok: 'approved', rev: 'out for review', wip: 'in progress', priv: 'private' }
const TONE = { fix: 'neg', ok: 'pos', rev: 'pending', wip: 'wip', priv: 'priv' }
const GLYPH = { fix: '✎', ok: '◆', rev: '◉', wip: '…', priv: '' }
const total = (c) => Object.values(c).reduce((a, b) => a + b, 0)
const title = (c) => [...Object.keys(c).filter((k) => c[k] > 0).map((k) => `${c[k]} ${LABEL[k]}`), `${total(c)} total`].join(' · ')

const seg = (k, n, opts = {}) => {
  const inner = (opts.glyph && GLYPH[k] ? `<span class="g">${GLYPH[k]}</span>` : '') + (k === 'priv' ? LOCK : '') + n
  return `<span class="${TONE[k]}" title="${n} ${LABEL[k]}">${inner}</span>`
}

// Each variant: counts -> the HTML of the pill(s) next to "My Changes".
const VARIANTS = {
  '1-all-states': {
    blurb: '<b>Every section gets a segment, then the grey total.</b> Section order left to right: red need changes, green approved, indigo out for review, pale in progress, outlined private. Hairlines keep the pale segments apart. Widest of the five.',
    pill(c) {
      const keys = Object.keys(c).filter((k) => c[k] > 0)
      if (keys.length === 1 && keys[0] === 'wip') return `<span class="count">${total(c)}</span>`
      return `<span class="count split lined" title="${title(c)}">${keys.map((k) => seg(k, c[k])).join('')}<span class="total">${total(c)}</span></span>`
    },
  },
  '2-no-total': {
    blurb: '<b>Segments only, no grey total.</b> The five segments already add up to the tab’s count, so the total goes to the tooltip. Shorter than variant 1, but the tab count has to be summed by eye.',
    pill(c) {
      const keys = Object.keys(c).filter((k) => c[k] > 0)
      if (keys.length === 1) return `<span class="count">${total(c)}</span>`
      return `<span class="count split lined" title="${title(c)}">${keys.map((k) => seg(k, c[k])).join('')}</span>`
    },
  },
  '3-two-groups': {
    blurb: '<b>Two groups inside one capsule.</b> Left: what waits on me (red, green). A small gap, then what waits on others: out for review and in progress in muted tones, and the total. Private sits outside as a lock pill, since it is a visibility flag rather than a state.',
    pill(c) {
      const mine = ['fix', 'ok'].filter((k) => c[k] > 0)
      const theirs = ['rev', 'wip'].filter((k) => c[k] > 0)
      const t = total(c)
      let out
      if (mine.length + theirs.length <= 1) out = `<span class="count">${t}</span>`
      else out = `<span class="count split lined" title="${title(c)}">${mine.map((k) => seg(k, c[k])).join('')}${mine.length && theirs.length ? '<span class="gap"></span>' : ''}${theirs.map((k) => seg(k, c[k])).join('')}<span class="total">${t}</span></span>`
      if (c.priv > 0) out += `<span class="count priv-pill" title="${c.priv} private">${LOCK}${c.priv}</span>`
      return out
    },
  },
  '4-glyphs': {
    blurb: '<b>Variant 1 with a glyph in each segment.</b> The same marks the menu-bar badge uses: ✎ need changes, ◆ approved, ◉ out for review, … in progress, a lock for private. Readable without colour, but the pill gets wider still.',
    pill(c) {
      const keys = Object.keys(c).filter((k) => c[k] > 0)
      if (keys.length === 1 && keys[0] === 'wip') return `<span class="count">${total(c)}</span>`
      return `<span class="count split lined" title="${title(c)}">${keys.map((k) => seg(k, c[k], { glyph: true })).join('')}<span class="total">${total(c)}</span></span>`
    },
  },
  '5-active-only': {
    blurb: '<b>Only the states that are moving.</b> Red, green and indigo segments for changes that are out in the world, then the total; in progress is what is left over, so it gets no segment. Private is the lock pill outside. Closest to what the pill does today.',
    pill(c) {
      const keys = ['fix', 'ok', 'rev'].filter((k) => c[k] > 0)
      let out
      if (keys.length === 0) out = `<span class="count">${total(c)}</span>`
      else out = `<span class="count split lined" title="${title(c)}">${keys.map((k) => seg(k, c[k])).join('')}<span class="total">${total(c)}</span></span>`
      if (c.priv > 0) out += `<span class="count priv-pill" title="${c.priv} private">${LOCK}${c.priv}</span>`
      return out
    },
  },
}

const topbar = (pill) => `<header class="topbar"><nav class="tabs"><button class="tab">Needs Review <span class="count hot">1</span></button><button class="tab">Reviewing <span class="count">2</span></button><button class="tab active">My Changes ${pill}</button><button class="tab">Merged <span class="count split"><span class="pos">3</span><span>7</span></span></button><button class="tab">Team Reviews <span class="count">4</span></button></nav><div class="topbar-right"><span class="muted small">updated just now</span><button class="btn">View ▾</button><button class="btn icon">⟳</button><button class="btn icon">⚙</button></div></header>`

const legend = `<div class="legend"><span><span class="count split"><span class="neg">n</span></span>Needs Changes</span><span><span class="count split"><span class="pos">n</span></span>Approved</span><span><span class="count split"><span class="pending">n</span></span>Out for review</span><span><span class="count split lined"><span class="wip">n</span></span>In Progress, review not requested</span><span><span class="count split"><span class="priv">${LOCK}n</span></span>Private</span><span><span class="count">n</span>Total</span></div>`

for (const [name, v] of Object.entries(VARIANTS)) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>My Changes pill: ${name}</title><link rel="stylesheet" href="base.css"><link rel="stylesheet" href="mock.css"></head><body><div class="app">
<div class="note">${v.blurb}</div>
${STATES.map((s) => `<div class="state">${s.name}</div>\n${topbar(v.pill(s.c))}`).join('\n')}
${legend}
<div class="mock-note">Today the pill shows only need changes and approved beside the total. Hover any pill for the full breakdown.</div>
</div></body></html>\n`
  writeFileSync(join(here, `${name}.html`), html)
}
