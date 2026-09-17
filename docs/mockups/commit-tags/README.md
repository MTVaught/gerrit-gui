# Commit tag mockups

Idea 8, the hover popover, was chosen and built; see `docs/screenshots/commit-tags.png`.

The trailers at the end of a commit message (`Bug: 4821`, `Test: pytest`,
`Depends-On: I7c3e…`) are not shown anywhere on the board today. Each page
shows the full window on top and the compact window under it, with the same
four changes; the first compact row is opened to show its detail row.
`Change-Id` and `Signed-off-by` are hidden in every idea but 5, which fades
them instead.

| File                 | Idea                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| `1-chips.html`       | Key/value chips on a line of their own under the subject; same chips in the ledger row. |
| `2-line.html`        | One muted monospace `Key: value` line under the subject; Bug and Depends-On on the ledger meta line. |
| `3-column.html`      | A Tags column of the grid, two per row plus "+N more"; a count pill and a key/value table in the ledger. |
| `4-pills.html`       | Colour and icon per known key (Bug, Test, Depends-On), clickable; icon-only dots in the ledger row. |
| `5-disclosure.html`  | An "N tags" toggle unfolds the message body and footer inside the card and the detail row. |
| `6-right.html`       | Trailers right-aligned on the title line, opposite the subject; split meta line in the ledger. |
| `7-footer.html`      | A tinted footer strip along the bottom of the card with the body's first line and the trailers; a footer line per ledger row. |
| `8-popover.html`     | A tag icon with a count beside the change number; hover opens a popover with the message footer. |
| `9-badge.html`       | Bug, Relates-To and Depends-On as badges next to the state badge, per branch row; the rest in the detail row. |
| `10-pane.html`       | A Details button opens a pane on the right with the whole message and a trailer table; a bottom sheet in the ledger. Rendered at 1400px. |

`gen.mjs` writes the five pages; `base.css` is a copy of the app stylesheet;
`mock.css` holds the tag styles and the compact frame.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> [width]`

The board fetches the message with the `CURRENT_COMMIT` query option;
`src/shared/trailers.ts` reads the `Key: value` lines of its last paragraph.
