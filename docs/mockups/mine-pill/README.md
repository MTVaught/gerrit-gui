# My Changes pill mockups

Today the count beside My Changes is a split pill with at most two coloured
segments, need changes (red) and approved (green), before the grey total.
These pages add segments for the other sections of the tab: Out for review,
In Progress, and Private. Each page shows the same three states of the tab.

| File                  | Idea                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------- |
| `1-all-states.html`   | One segment per section in section order, then the total. Hairlines between segments.  |
| `2-no-total.html`     | Same segments, no total; they already add up to it. Total only in the tooltip.         |
| `3-two-groups.html`   | Red/green, a gap, then muted review/in-progress and the total. Private is a lock pill outside. |
| `4-glyphs.html`       | Variant 1 with the menu-bar glyphs inside each segment, so colour is not the only cue. |
| `5-active-only.html`  | Red/green/indigo and the total; in progress is the remainder. Private is a lock pill outside. |

Tones: out for review uses the Needs Review badge colours (indigo); in
progress is the panel grey with muted text; private is outlined with a lock.

`gen.mjs` writes the five pages; `base.css` is a copy of the app stylesheet;
`mock.css` holds the candidate segment tones and the captions.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> [width]`
