# Grouping by Change-Id: five presentations

A cherry-pick keeps the Change-Id of the original commit, so one change can
exist on several branches. All five mockups show the same data on the "My
changes" tab of Alice:

- "Fix token refresh race in session store" on `master` (Approved),
  `release-2.1` (Needs review) and `release-2.0` (Needs changes).
- "Bump protobuf to 4.25.3" on `master` and `release-2.1`, both out for review.
- "Log a warning when the CA bundle is missing" on `release-2.1` (Approved);
  the `master` change is already merged and sits on the "Recently merged" tab.
- Three ordinary changes with no cherry-picks.

| # | File | Where a family sits | Each branch keeps its own buttons | Rows per family |
| --- | --- | --- | --- | --- |
| 1 | `1-nested-rows` | Every change stays in its own section. Members in the same section nest under one header; the others are named in an "Also on" line. | Yes | One per member in the section |
| 2 | `2-branch-chips` | One card in the section of the most urgent branch. A chip per branch; the selected chip drives the card. | One branch at a time | One |
| 3 | `3-branch-table` | One card in the section of the most urgent branch, with a table row per branch. | Yes | One card, one table row per branch |
| 4 | `4-collapsible-summary` | One summary row in the section of the most urgent branch, with a pill per branch. Expand for the full rows. | After expanding | One, or one plus the members |
| 5 | `5-flat-link-badge` | Every change stays in its own section. A colored rail, a "branch · n of m" badge and a "Same change on" line tie the rows together. | Yes | One per member |

Options 1 and 5 keep the tab and section counts as they are today, because
no change moves. Options 2, 3 and 4 pull a family into one place, so a
section can show a change whose own state belongs to a later section.

Option 3 is what the application does. `3-branch-table-merged-tab` shows the
same design on the "Recently merged" tab, where a merged branch leads the card
and an open cherry-pick of it is listed below with its live state.
