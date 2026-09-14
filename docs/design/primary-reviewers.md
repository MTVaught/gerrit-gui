# Primary reviewers: design record

Status: implemented. `README.md` describes the result.

## Before

The team list in Settings did two jobs. It decided which tabs a change was
on, by the owner, and it decided whose votes counted: every reviewer on the
team was waited for, everyone else was inert. That failed in two ways. A
teammate CI added as a reviewer was waited for although nobody asked them.
And each user's state came from their own team list, so two users could see
different states for the same change.

## Goal

1. The people who decide a change are named on the change, one by one, in
   Gerrit, so every user sees the same state.
2. Adding one is one step: the person is added as a reviewer in Gerrit when
   needed, and named as a decider.
3. Anyone on the change can name or un-name a decider, not only the owner.
4. The team list stays, for the tabs only.

## The tag

A primary reviewer is a hashtag next to the merger tag:

    reviewer:bob
    reviewer:carol
    merger:dave

The key is the Gerrit username in lower case, or the email address for an
account without one, as for `merger:`. One tag per person; any number per
change. The state comes from the votes of the tagged people alone. The
reasons for a hashtag over a custom keyed value are the same as for the
merger tag (`merge-request.md`), with one more: only the owner can write a
keyed value, and reviewers must be able to tag each other.

Rules:

- The owner and bots are ignored when tagged.
- A tag for a person who is not on the change in Gerrit still counts. The
  application shows a stand-in with the name behind the key and waits for
  the vote. The dashboard search includes `hashtag:reviewer:<me>`, so that
  person sees the change without being a reviewer in Gerrit.
- No tags means nobody decides. A request leaves the change in Needs
  Review; the Request review button is off until somebody is tagged. There
  is no fallback to the team list: a fallback would make the state depend
  on the local list again.
- Re-requesting review keeps the tags. Clearing ready-to-merge keeps them.

## Actions

| Button | Gerrit calls |
| --- | --- |
| "+", Primary | `GET /accounts/<input>/detail`, so that a group or an unknown name is refused before anything changes; `POST /changes/<n>/reviewers`; `POST /changes/<n>/hashtags` add. |
| "+", Other (owner only) | `POST /changes/<n>/reviewers`, as before. |
| "×" on a primary chip | hashtags remove, then `POST /changes/<n>/reviewers/<id>/delete`. A 403 on the second call is swallowed: the tag is everyone's, the reviewer row is the owner's. |
| "↓" on a primary chip | hashtags remove. |
| "↑" on an other chip | hashtags add. |

Anyone tagging needs Gerrit's Edit Hashtags permission, which the default
access rules grant to the owner only. The seed script grants it to
Registered Users on the test project; a real server needs the same.

## Tabs

The team list picks the tabs by owner, as before, and gains a tab:

| Tab | Owner | Listed |
| --- | --- | --- |
| Needs Review, Reviewing, My Changes, Ready to Merge, Recently Merged | on the team | as before, with "primary" for "reviewer" on Needs Review |
| Team Reviews | someone else on the team | every open change, reviewed by me or not; not exclusive |
| External Reviews | outside the team | every open change I am on; exclusive, as before |

Team Reviews needs a query the board did not have: `is:open (owner:a OR
owner:b ...)` over the team list, with the project scope from Settings.
