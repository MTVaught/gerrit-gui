# Review rounds mockups

Today `review-requested-ps` holds one patch set number, replaced on every
request, so a change on its third round of review looks like one nobody has
opened. These pages keep every asked patch set and use that history to tell
apart a first review from an iteration.

Definitions used on every page:

- A **round** is a patch set the owner asked to have reviewed.
- A round is **reviewed** once any primary reviewer voted on that patch set.
- A change is **iterating** once any round is reviewed; **fresh** until then.
  A request that was never answered before the next push does not count
  (#40 on the pages).
- **Withdraw** is offered only when the change is fresh and the only round is
  the current patch set; it removes the request entirely.

Only the In Progress rows of My Changes differ between iterating and not.
Out for review is one section on every page and the reviewer tabs are not
shown: a first review and a follow-up review are not told apart.

Every page shows the same seven changes on My Changes, with the Gerrit
hashtags and keyed values for #27 (asked on PS 2, 4 and 5; voted on PS 2 and
4) under that page's storage shape.

| File                      | Rendering                                                        | Storage shape                                              |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| `1-split-sections.html`   | In Progress splits into "iterating after review" and "not reviewed yet". Rows unchanged. | `review-requested-ps = 2,4,5` (append to the existing keyed value). |
| `2-badge.html`            | One In Progress section; amber "after review" badge beside the state on iterating rows. | One hashtag per round: `review:ps2 review:ps4 review:ps5`; keyed value dropped. Searchable. |
| `3-patch-set-strip.html`  | PS cell of In Progress rows lists every asked patch set, coloured by outcome. | One keyed value per round: `review-round-1 = 2`, `review-round-2 = 4`, ... |
| `4-words.html`            | PS cell reads "reviewed on PS 2" or "asked PS 1, unreviewed"; no badge or section. | Keyed list as in 1, plus a marker hashtag `iterating` for Gerrit search. |
| `5-iterating-state.html`  | "Iterating" replaces the In Progress badge and gets its own section; the only page that adds a state. | Hashtag `review-round:3` (replaced each request) plus the keyed list. |

`gen.mjs` writes the five pages; `base.css` is a copy of the app stylesheet;
`mock.css` holds the storage panel and the candidate badges and strip.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> 1240`
