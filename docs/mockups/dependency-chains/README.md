# Dependency chains: five presentations

A branch often carries several commits pushed together, each built on the
one before. Gerrit makes a change of each and submits a change only after
the ones below it, so a reviewer should read them in order, base first.
Today the board lists them as unrelated cards, in update order, with nothing
to say that #63 is built on #62.

All five mockups show the same data, the "Needs Review" tab of Alice at
1200px:

- A chain of four by Bob on `master`, topic `settings-table`: #61 (Approved,
  Alice voted +1), #62 (Needs Review), #63 (Needs Review, built on an older
  patch set of #62) and #64 (In Progress, review not asked).
- A chain of two by Dave on `release-2.1`, no topic: #70 and #71, both Needs
  Review.
- One ordinary change with no parent or child.

The tab count stays 5: the changes that wait on Alice, whatever the cards.

| # | File | What the reader sees | Cards on the tab | Changes off the tab (#61, #64) |
| --- | --- | --- | --- | --- |
| 1 | `1-chain-card` | One card per chain, one row per change, base first, the subject in the first column. A step circle marks the next one to review. | 3 | Rows in the card, greyed |
| 2 | `2-linked-cards` | Today's cards, kept in their sections. Members of a chain sort together and join into one block with a rail in the gutter; the head says "2 of 4", what it needs and what builds on it. | 5 | Named in the head badges only |
| 3 | `3-badge-popover` | Today's cards and order. A "2 of 4" badge in the head opens the chain as a list with states and your votes. | 5 | In the popover |
| 4 | `4-stack-group` | A tinted box in the section with a header (topic, branch, how many wait on you, which is next) and every member as a full card, numbered in the gutter. | 3 boxes | Cards in the box, dashed and greyed |
| 5 | `5-next-up` | One card per chain: the lowest change that waits on you, as today, with a stepper in the head and a footer naming what it is built on and what comes next. | 3 | In the footer |

Trade-offs:

- Design 1 is the closest to the Change-Id family card and the shortest way
  to show a whole chain, but the subject has to share a column with the
  branch of single changes and gets cut at about 40 characters, and the head
  needs a title: the topic when there is one, "no topic" otherwise.
- Design 2 changes the least and keeps every card as it is, but a chain is
  only as visible as its badges, and a member that is not on the tab is a
  pointer the reader must follow.
- Design 3 is the smallest change of all and the board looks as it does now.
  The order of review is behind a click, so nothing stops a reader from
  opening #63 first.
- Design 4 shows the most and hides nothing: every member is a full card
  with its own head line. It is the tallest of the five by a wide margin.
- Design 5 gives the reviewer exactly one thing to do per chain and the board
  stays as short as today. Changes further up the chain (#63, #71) are not
  cards, so the tab count and the number of cards differ, and the reviewer
  cannot open #63 from the board until #62 is done.

Design 1, the chain card, is the one to build.

## Persistence and rules

The sequence view is opt-in, not the default. The owner turns it on with a
`sequence` hashtag on each change that should be viewed as part of the
chain, set from the flags menu beside WIP and Private. A hashtag matches
how the application stores every other owner decision (`ready-to-merge`,
`reviewer:`, `merger:`, `slack:`): it needs no new patch set, survives a
rebase, and is visible and searchable in Gerrit (`hashtag:sequence`). The
topic is shown on the chain header but is not the flag, because a topic
can make Gerrit submit the whole set together. A custom keyed value would
work but is invisible in Gerrit.

The tag says only "present in sequence". Membership and order come from
Gerrit's parent links. Decided:

- A tagged change whose parent is not tagged is the base of its chain.
- A tagged change with no open parent or child is an ordinary card; the tag
  is ignored.
- The tag changes no workflow. Request review, Ready to merge and the votes
  stay per change.
- Only the owner sets or clears the tag, as with the `reviewer:` tags.

The owner picks the members in a manager of its own; `manage/` has five
mockups for that surface, and design 1 there, the popover checklist, is
the one to build. `toggle/` has five mockups for where it is opened from; design 4 there,
the stub card, is the one to build.

What every design needs from Gerrit: the parents of each change, from the
`related` endpoint or the `CURRENT_COMMIT` option, and the topic. The "on #62
PS 1" badge needs the parent's patch set as well as its number.

`gen.mjs` writes the five pages from one data set; `base.css` is a copy of
the application stylesheet and `mock.css` adds the static top bar and the
note.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> 1200`
