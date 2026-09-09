# Review button mockups

Replaces the +1/−1 vote dialog on reviewer rows with a button that opens Gerrit's
diff view between the last patch set the reviewer signed off on and the current
one (base if never reviewed). Voting happens in Gerrit.

Gerrit URLs the button would open (`/c/<project>/+/<number>/...`):

| Situation                                | Path            |
| ---------------------------------------- | --------------- |
| Never reviewed, current PS 5             | `/5` (vs base)  |
| Last voted on PS 3, current PS 5         | `/3..5`         |
| Already voted on the current PS 4        | `/4`            |

"Last reviewed" = highest patch set the user voted or commented on (from change
messages `_revision_number`, or the `all` votes with `date` per revision).

| File                        | Idea                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `1-range-in-label.html`     | One button, range in the label: "Review PS 3 → 5".          |
| `2-button-with-caption.html`| Fixed label "Review in Gerrit", caption explains the range and your last vote. |
| `3-split-button.html`       | Split button; caret offers since base / since previous PS / change page / copy link. |
| `4-patch-set-strip.html`    | Per-row patch-set strip with your votes marked; connector shows the range. |
| `5-chips-and-icon.html`     | Reviewer chips carry the PS of each vote; short monospace range button; compact-window frame. |

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> [width]`
