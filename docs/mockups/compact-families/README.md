# Families in the compact window: five presentations

The full window shows the changes that share a Change-Id as one card with a
row per branch (`docs/mockups/change-id-groups/`, design 3). The compact
ledger does not: every branch is its own line, in the section of its own
state, and the only hint is the branch name in the grey sub-line. So the two
branches of one change can sit on either side of an unrelated change, and a
three-branch change is spread over three sections.

All five mockups show the same data, the "Mine" tab of Alice in a 460px
window:

- "C4 needs changes" on `master` and `release-2.0`, both Needs changes.
- "C5 approved by everyone" on `master` (Approved), `release-1.0` (out for
  review) and `release-2.0` (Approved).
- "C6 ready-to-merge" on `master` (merged) and `release-1.0` (Ready to merge).
- "C2 review requested" on `master` (out for review) and `release-2.0` (in
  progress).
- Single changes with no cherry-picks in every section.

| # | File | Where a family sits | Lines per family | Each branch keeps its own action |
| --- | --- | --- | --- | --- |
| 1 | `1-stacked-lines` | Section of the most urgent branch, like the cards. | One for the subject plus one short line per branch, joined by a tree guide. | Yes |
| 2 | `2-summary-pills` | Section of the most urgent branch. | One. A pill per branch, coloured by its state, replaces the sub-line. | Lead branch on the line; the others after a tap, in the detail row |
| 3 | `3-branch-tabs` | Section of the most urgent branch. | One. A segmented switch of branches; the selected branch drives the line. | One branch at a time |
| 4 | `4-family-header` | Section of the most urgent branch. | A tinted header line for the subject plus one full ledger line per branch, titled by branch. | Yes |
| 4b | `4b-island` | As 4. | As 4, but the family is a bordered, tinted box with a spacer above and below, as the cards are on the full window, and the fork glyph leads the header. | Yes |
| 4c | `4c-tree` | As 4. | As 4, without a tint: a heavier line opens and closes the family and the members hang from the header with a tree guide. | Yes |
| 5 | `5-flat-marker` | Every branch stays in the section of its own state, as today. | One per branch. A family badge ("master · 1 of 3") and a "Same change on" list in the detail row tie them together. | Yes |

Designs 1 to 4 move a family to one place, so a section can show a branch
whose own state belongs to a later section; the section counts keep counting
changes, as on the full window. Design 5 moves nothing.

Trade-offs:

- Design 1 is the closest match to the full window's card and keeps every
  action one tap away, but the branch line has no room for the age or the
  diff, so the sub-line shrinks to branch and state.
- Design 2 is the shortest list. The cost is that the buttons of the other
  branches are behind a tap, and the reviewers on the line are the lead
  branch's only.
- Design 3 keeps one line per family and one action per line, but hides the
  other branches' reviewers and buttons behind a switch, and three long
  branch names do not fit the column.
- Design 4 is the tallest, as tall as today plus a header line per family, but every line is an ordinary
  ledger line, so the expand-for-details behaviour, the CI badge and the
  rail colour need no new rules. The header line is the only new element.
- Designs 4b and 4c answer the same doubt about design 4: its tint is too faint and its member lines start where a single change starts, so a family and its neighbour blend. 4b boxes the family, 4c indents it.
- Design 5 keeps the ledger's one-line-per-change contract and the counts
  as they are. It marks a family but does not gather it; the reader still
  scrolls between sections to see the whole family.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> 460`
