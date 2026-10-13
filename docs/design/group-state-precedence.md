# Sequence placement and member states

Status: implemented. Sequences use dedicated sections on My Changes and Reviewing.

Sequences get a dedicated Sequences section within My Changes and Reviewing.
Each member keeps its own state. A sequence appears in Needs Review whenever
at least one member has a current review request awaiting my vote.

A sequence can contain work being prepared, work under review, approved
changes, and merged changes at the same time. Assigning the whole sequence
to one member's state obscures that mix. A dedicated section gives the
sequence a stable location while its members advance independently.

## Tab eligibility

| Location | When a sequence appears |
| --- | --- |
| My Changes → Sequences | At least one member is an open change I own. |
| Reviewing → Sequences | At least one member is an open change owned by somebody else that I review. |
| Needs Review | At least one member has a current review request awaiting my vote. |

The same sequence can appear in Reviewing and Needs Review. Needs Review
shows what requires my action; Reviewing keeps the sequence visible while
I wait for the author or other reviewers.

Eligibility remains per member. A current request awaiting my vote means
I am a primary reviewer, the owner requested review of the current patch
set, and I have not voted on that patch set. Being a reviewer in Gerrit,
an attention-set entry, or an old request alone does not qualify.

Only members eligible for a tab can bring the sequence onto it. Other
members remain visible as context, including cherry-picks and merged steps.
An entirely closed sequence leaves My Changes and Reviewing. Existing
merge-queue and history rules still govern the Merged tab.

## Dedicated Sequences sections

On My Changes and Reviewing, render each eligible sequence once in the
Sequences section. Its members do not also appear as separate cards in
state sections on the same tab.

The header identifies the sequence and summarizes its members. It does
not assign a single state to the sequence. For example, a reviewer might
see “2 need your review · 1 waiting on others · 1 approved.” An owner might
see “1 in progress · 2 under review · 1 approved.”

Keep each member's status and available actions visible. Requesting review,
voting, withdrawing a request, and requesting a merge affect the selected
member only. Members do not have to advance together.

Use the selected board sort to order sequence cards within the section,
with the existing deterministic sequence order as a tie-break. State changes
do not move a sequence into another section. Place the Sequences section
before the ordinary state sections on these two tabs.

Keep private indicators on individual members. Membership in Sequences
does not imply that every member is public or at the same stage.

## Needs Review behavior

Show the whole sequence for context, clearly mark every member awaiting my
review, and make the next pending member easy to open. Pending cherry-pick
branches count too, even when the main branch has already been reviewed.

Keep the existing Pass Around and In Person sections. A sequence with any
pending pass-around request appears in Pass Around. Otherwise, a sequence
with a pending in-person request appears in In Person. It appears once on
this tab, even when both kinds of request exist within it.

After I review one member, the sequence stays in Needs Review while any
other member still qualifies. Once none qualify, it leaves Needs Review
and remains in Reviewing while an eligible member is still open. It does
not move into Reviewed, waiting on others as a whole sequence.

A new patch set cancels the previous request for that member. It returns
the sequence to Needs Review only after the owner requests review again
and my vote is pending, or another member already qualifies.

## Families and other tabs

A family groups cherry-picks of one Change-Id. Standalone families retain
their current placement behavior. Any revision to their state precedence
is a separate decision; standalone families keep their existing state
hierarchy.

Families inside a sequence remain inside their sequence steps. Their
branches keep individual states and contribute to pending review detection.
They do not create additional cards on the same tab.

Team Reviews and External Reviews retain their current placement rules.
Dedicated Sequences sections are limited to My Changes and Reviewing.

## Filtering and counts

A sequence counts as one card on each tab where it appears. The Sequences
section count is the number of sequence cards, not the number of members.
Needs Review counts a sequence once even if several members need my review.

Filters match eligible members on the current tab. A matching member keeps
the sequence visible with its other members as context. Filters can hide
a sequence but cannot move it into a state section on My Changes or Reviewing.

Card and compact layouts must show the same placement, member states,
pending review markers, and counts. Tab segments must account for sequence
cards consistently with the dedicated section rather than attributing the
whole sequence to one member's state.

## Acceptance examples

Run these cases in both card and compact layouts, including sequences with
cherry-pick families and reversed input order:

| Situation | Expected result |
| --- | --- |
| My sequence contains In Progress and Pass Around members | One card in My Changes → Sequences, with both member states visible. |
| A sequence I review contains Needs Changes and a request awaiting my vote | One card in Reviewing → Sequences and one in Needs Review. |
| Two members need my review; I vote on one | The sequence stays in Needs Review and identifies the remaining pending member. |
| I vote on the last pending member; other reviewers are still pending | The sequence leaves Needs Review and stays in Reviewing → Sequences. |
| The main branch is reviewed but a cherry-pick still needs my vote | The sequence stays in Needs Review and identifies the pending branch. |
| Pending requests include both pass-around and in-person review | One sequence card under Pass Around in Needs Review, showing both request kinds. |
| Only an in-person request awaits my vote | One sequence card under In Person in Needs Review. |
| A newer patch set replaces the only pending request without a new request | The sequence leaves Needs Review and stays in Reviewing → Sequences. |
| All members are closed | The sequence leaves My Changes and Reviewing. |
| A filter matches one eligible member | One sequence card remains visible with the other members as context. |

## Implementation notes

Sequence placement on My Changes and Reviewing uses a dedicated section
and a stable eligible member as its sort anchor. Needs Review follows its
section order, so pending pass-around requests precede pending in-person
requests. Individual state derivation and standalone family placement
retain their existing rules. Merged steps present in the dashboard remain
context until the last tagged member closes.

Before this change, a model-level check with two primary reviewers kept both
a family and a sequence in Waiting on you after voting on only one member.
Voting on both moved them to Reviewed, waiting on others. The reported
application failure still needs a failing data fixture or UI reproduction.
The dedicated section addresses the broader ambiguity of assigning one
state to a sequence; it does not establish the cause of that failure.
Regression tests cover member votes, pending cherry-picks, request kinds,
new patch sets, closure, filtering, and consistent section counts.
