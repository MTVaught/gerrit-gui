# Managing a sequence: five surfaces

The chain card is opt-in, and which related changes form the sequence is
the owner's call, so the owner needs a place to say so. These mockups show
that surface. The openers that lead to it are in `../toggle/`.

All five show Bob's "My Changes" tab at 1200px. Gerrit relates five of
Bob's changes on `master`: #61, #62, #63 and #64 built on each other, and
#65, which also builds on #62 (a sibling of #63). The line the owner wants
is #61 to #64; #65 stays an ordinary card.

| # | File | Surface | Picks members by | Shows | Also offers |
| --- | --- | --- | --- | --- | --- |
| 1 | `1-popover-checklist` | Menu anchored to the opener, like the add-reviewer popover | Checkbox per related change | Number, subject, state | Nothing else |
| 2 | `2-dialog-preview` | Centred dialog | Checkbox per related change | The same, plus a live preview of the chain card | A name, Remove sequence |
| 3 | `3-side-drawer` | Drawer from the right edge, board still visible | Checkbox per related change | Number, subject, state, your reviewers' votes | A name, Remove sequence, and actions on every change in the sequence: request review, add a primary reviewer, mark active |
| 4 | `4-inline-edit` | The chain card itself, in place | Checkbox before each row; changes off the line appear as struck rows | Every live cell of every row | A name, Remove |
| 5 | `5-path-picker` | Centred dialog | Click a tip in the relation tree; the sequence is the line from the base to it | The tree on the left, the resulting sequence on the right | A name, Remove sequence |

Trade-offs:

- Design 1 is the smallest and matches a surface the owner already knows.
  It has no room for anything but the list.
- Design 2 is the only one that shows the result before it is written.
  It covers the board.
- Design 3 has room for chain-wide actions, which is what the owner of a
  stack does most: ask for review of all of them, add the same reviewer to
  all. It is the largest surface and stretches the feature past "which
  changes are in it".
- Design 4 adds no surface and keeps everything live while editing, but it
  puts an editing state on the busiest component on the board, and for a
  set with no sequence yet it has to conjure a provisional card.
- Design 5 is the only one that says what a sequence is: one path through
  the parents. Checkboxes let the owner tick #63 and #65, which is not a
  line; a tip picker cannot. For a chain with no fork it is a checklist
  with a drawing in front of it.

Design 1, the popover checklist, is the one to build.

What every surface writes: the `sequence` hashtag on the members, removed
from any related change left unticked. The name is the topic when there is
one; a design with a name field would need somewhere else to keep it (a
custom keyed value on the base) if the topic is not to be changed.

`gen.mjs` writes the five pages from `../lib.mjs`.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> 1200`
