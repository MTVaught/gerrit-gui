# Opening the sequence manager: five options

The owner sets up a sequence in a manager of its own (`../manage/`); these
mockups show where the owner opens it. All five show Bob's "My Changes"
tab at 1200px with an untagged set of four related changes on `master`
(#61 Approved, #62 and #63 out for review, #64 not yet asked) and one
other change. Each opener leads to the same manager for the change's
relation set; once a sequence exists, the same place reads "Edit
sequence…" and opens the manager on it.

| # | File | Where | Visible before a sequence exists | A way back to edit |
| --- | --- | --- | --- | --- |
| 1 | `1-flags-menu` | A third line, "Sequence…", in the owner's WIP / Private menu on every change with relatives. | No, behind the caret | Same line, "Edit sequence…" |
| 2 | `2-head-tab` | A dashed "+ sequence" tab hanging from the card's top edge, beside "+ Slack", on every change with relatives. | On hover only | A solid "sequence" tab on the chain card |
| 3 | `3-bar` | One bar above the cards in the section of the lowest waiting change, naming the members, with a "Set up a sequence…" button. | Yes, always | An "Edit sequence…" button on the chain card's head |
| 4 | `4-stub-card` | A dashed stub card with the chain badge, the numbers and a "Set up a sequence…" button. | Yes, always | The same button on the chain card's head |
| 5 | `5-request-menu` | A last line in the Request review menu, offered when the change has relatives. | Only while requesting | None; needs one of the others as well |

Trade-offs:

- Design 1 adds nothing to the board and matches where the other owner
  flags are, but nobody finds it without looking.
- Design 2 shows the affordance only where it applies, which is a hint in
  itself, but it is hover-only and the corner already holds the Slack tab.
- Design 3 cannot be missed and needs no explanation. It is another element
  on a busy tab, and it repeats for every untagged relation set.
- Design 4 puts the opener in the same place before and after, so it is
  learned once. The stub costs a card's height for a set the owner may
  never want joined.
- Design 5 puts the opener at the moment the owner thinks about reviewers,
  but only on a change not yet requested, so it cannot stand alone.

Design 4, the stub card, is the one to build. Design 5 was liked but
rejected: the Request button is something else once the change is
requested, and an opener that comes and goes is harder to find.

`gen.mjs` writes the five pages from `../lib.mjs`; `base.css` is a copy of
the application stylesheet as of main after PR #72, so the cards match the
current column order.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> 1200`
