# Slack thread on a change: ten presentations

A review sometimes has a conversation on Slack. The link is kept in Gerrit
as the hashtag `slack:<url>`, so any client sees the same data; these
mockups are about where the board shows it and how a link is added. Every
page shows the same two changes in the full window and in the compact
window: "Fix token refresh race in session store" has a conversation
linked, "Bump protobuf to 4.25.3" has none yet.

| # | File | Where the link is | Adding one | Compact line |
| --- | --- | --- | --- | --- |
| 1 | `1-head-pill` | A "Slack thread ↗" pill in the title line, after the project and owner; × unlinks | "+ Slack thread" in the same place opens a one-field panel | A bubble in the sub-line, after the number |
| 2 | `2-reviewer-chip` | A chip in the reviewers line, after the "+" | A second "+" with a bubble | A bubble in the avatar stack |
| 3 | `3-action-button` | A "Slack ↗" button among the actions | "Link Slack thread…" in the owner's WIP menu | Nothing; the detail row has the button |
| 4 | `4-discussion-line` | A line of its own under the row, with the workspace and who linked it | A muted line "+ Link the Slack conversation…" | A third line in the cell |
| 5 | `5-subject-mark` | A bubble right after the subject, tooltip holds the link | "+ Slack" after the project and owner | A bubble after the subject |
| 6 | `6-state-badge` | An outlined "Slack" badge in the state cell, like the Private badge | A dashed "+ Slack" badge in the same cell | A small "Slack" badge in the sub-line |
| 7 | `7-corner-tab` | A tab hanging from the top edge of the card, at the right | A dashed "+ Slack" tab | The same tab on the top edge of the line |
| 8 | `8-links-tray` | A tray of "Gerrit ↗" and "Slack ↗" buttons at the right of the title line | "+ link" in the tray | Nothing; the detail row has the button |
| 9 | `9-conversation-row` | A row of the card titled `slack`, as a branch row, with the workspace, date and who linked it | A muted row "+ Link the Slack conversation…" | A line under the change, as a branch line of a family |
| 10 | `10-leading-mark` | A bubble in front of the subject, where a family card has its fork glyph | The owner's WIP menu | A bubble in front of the subject |

The application uses design 7. `gen.mjs` writes the ten pages; `base.css`
is a copy of the application stylesheet.

`gerrit-webgui.png` is the change page of a Gerrit 3.11 test server with the
tag set: Gerrit lists it under "Hashtags" as a chip (truncated, the full
value in the tooltip) that links to the hashtag search, and the change log
records who added it.

Render:

```sh
node docs/mockups/slack-link/gen.mjs
for f in docs/mockups/slack-link/[0-9]*-*.html; do
  xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs "$f" "${f%.html}.png" 1180
done
```
