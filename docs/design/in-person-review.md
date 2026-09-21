# In-person review: design record

Status: implemented. `README.md` describes the result.

## Goal

A second kind of review request. A pass-around review is the one the board
had: each primary reviewer reads the change on their own and votes. An
in-person review is asked for when the author wants to walk the reviewers
through the change together; the reviewers still vote in Gerrit afterwards,
and the outcome is decided the same way. The board tells the two apart so
that a reviewer knows which changes to read at their desk and which to wait
for the meeting on, and so that the tray does not nag about the latter.

## Where the kind lives

A second custom keyed value next to the request:

    review-requested-ps = 2,4,5
    in-person-review-ps = 5

`in-person-review-ps` holds one patch set number. The open request is
in-person when the value equals the current patch set and the request in
`review-requested-ps` is open for that patch set. Anything else, including a
value left from an earlier patch set, means pass-around.

A custom keyed value rather than a hashtag, for the same reason as the
request itself: only the owner (or an admin) may write it, so a reviewer
cannot change the kind of somebody else's request. The value is not
searchable, but it does not have to be: the change is found by the owner
and `reviewer:` queries the board already runs. Older versions of the
application ignore the key and show the change as an ordinary request.

## State

`in-person-review` sits beside `needs-review` in the ladder: the same tests
put a change there, plus the value; the same votes take it out. In the
urgency order it comes before `needs-review`, so a family with one branch
asked for in person and another passed around leads with the in-person one:
a meeting to arrange outranks a change to read alone. Everything
that reads `reviewRequested` (withdraw, reviewer chips, the Review button)
treats both kinds alike. `needsMyReview` is true for both, so the reviewer's
sections and notifications include in-person requests, but the tray's
"review" category counts pass-around requests only.

## Sections and pills

| Tab | Sections |
| --- | --- |
| Needs Review | "Pass Around", then "In Person" |
| Reviewing, Team Reviews, External Reviews | "Waiting on you" and "Reviewed, waiting on others" as before (pass-around only), then "In Person" (not split by vote), then the states |
| My Changes | "Pass Around" (was "Out for review"), then "In Person", between Ready to Merge and Iterating |

The Needs Review count becomes a split pill: the pass-around count in the
accent colour, as the plain pill was, then the in-person count in the grey
of an ordinary count. With no pass-around requests the pill is plain grey.
The My Changes pill keeps one "out for review" segment covering both kinds.

## Buttons

| Button | Gerrit calls |
| --- | --- |
| Request review, main part | as before: `review-requested-ps` appended; `in-person-review-ps` removed in the same call |
| Request review, caret, "In-person review" | `review-requested-ps` appended and `in-person-review-ps` set to the patch set, in one call |
| Withdraw request, main part | removes both values |
| Withdraw request, caret, "Switch to ..." | sets or removes `in-person-review-ps` only; the round is untouched |
| "Pass around" / "In person" (later rounds, where there is no Withdraw) | the same switch, as a menu button |

A re-request is always pass-around by default; the caret is there each time.

## What changes in the code

- `src/shared/constants.ts`: `IN_PERSON_REVIEW_KEY`.
- `src/shared/types.ts`: the state, `ChangeView.inPerson`, `requestReview.inPerson`, the `setReviewKind` action.
- `src/shared/model.ts`: `inPersonPatchSet`, the ladder, labels, urgency, the sections, the Needs Review pill segments, the tray's review category.
- `src/main/service.ts`: the two actions and the withdraw.
- `src/renderer/src/components/actions.ts`: `ActionSpec.split`, the request and withdraw specs, the kind button.
- `src/renderer/src/components/SplitButton.tsx`: the owner's split button; `FlagsMenu` takes its class from the spec.
- `src/renderer/src/App.tsx`: the `hot` and `plain` pill tones; the notification names the kind.
