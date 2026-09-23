# Merge request flow: design proposal

Status: implemented. `docs/walkthrough.md` shows the result. This document is the design record.

## Today

The last two steps of the workflow are:

6. The owner pushes "Ready to Merge". The application adds the hashtag
   `ready-to-merge`.
7. Anyone with +2 rights sees the change on the "Ready to Merge" tab and in
   the tray count, and pushes "+2 and submit".

Step 6 names nobody. Every user who can +2 is asked at once, and nobody is
asked in particular. In practice the developer asks one person, usually the
team lead, and sometimes someone else for a one-off change.

## Goal

1. The owner asks one specific person to merge. Every merge request names a
   person. The usual candidates for a project are one click away; anyone
   else on the server is a search away.
2. The person who was asked sees the request as something that waits on
   them: tab section, tray count, desktop notification.
3. The person who was asked merges from the application, as today. If they
   cannot or will not, they talk to the developer. The application has no
   "decline" or "hand over" step.
4. No database. A user who looks at Gerrit directly must see the same thing.

## 1. Where the request lives: a second hashtag

The request is a hashtag next to `ready-to-merge`:

    ready-to-merge
    merger:alice

`alice` is the Gerrit username, lower-case. When an account has no
username, the application uses the email address. Both are what the Team
list stores, and both are readable on the Gerrit change page. Account ids
would survive a renamed account, which is rare, and would be meaningless
in Gerrit's hashtag row.

Why a hashtag and not a custom keyed value:

| | Hashtag `merger:alice` | Keyed value `merger = alice` |
| --- | --- | --- |
| Visible in the Gerrit UI | Yes, on the change page | No |
| Searchable | `hashtag:merger:alice` | No search operator |
| Who can write it | Owner, and anyone with Edit Hashtags (same as `ready-to-merge` today) | Owner and admins only |
| Cleared by a new patch set | No (same as `ready-to-merge`) | No |

A new patch set does not clear either, so the patch set the request was for
is recorded separately, in the custom keyed value `ready-to-merge-ps`, the
way `review-requested-ps` records the review request. The tag counts only
while the value matches the current patch set; otherwise it is stale.

`ready-to-merge` stays. It is the state, `merger:` is the addressee. The
application always writes both, in one request. One `merger:` tag per
change; "Change merger" replaces it.

Rules:

- "Re-request review" already clears `ready-to-merge`. It clears `merger:*`
  in the same request.
- "Clear ready-to-merge" clears `merger:*` too.
- The merger is **not** added as a reviewer or CC. CC keeps its normal
  Gerrit meaning. The consequence is that Gerrit itself does not tell the
  merger anything: no email, nothing in their Gerrit dashboard. The
  application is the notification channel (refer to "Merger side"). A
  merger who does not run the application does not learn about the request
  unless the developer tells them.

### A tag without a merger

A change tagged `ready-to-merge` with no `merger:` tag can only come from
an older version of the application. During the rollout, users with +2 see
those under a section "Tagged without a merger" on the Ready to Merge tab,
and they count in the tray for every user with +2, as today. Once every
user has the new version, no such changes are made any more, and the
section stays empty. It can be removed in a later release.

## 2. Settings: mergers per project

A new "Mergers" section under "Team":

```
Mergers
  Project            People
  platform/*         alice, bob
  tools/build        carol
  *  (all projects)  alice
  [+ Add project]
```

- The project column takes the same syntax as "Projects to watch": an exact
  name, or a prefix ending in `*`. `*` alone is the fallback for every
  project.
- The people column is the same chip editor as "Team": type a username or
  email, or pick an account from the server.
- When a change is in a project that matches several rows, the list shown
  to the owner is the union, most specific row first.
- The list is a setting of this computer, like the team. Unlike the team,
  two users with different lists do not see different states; the list only
  fills a menu. A wrong or empty list costs one search, nothing more.

Stored as:

```json
"mergers": [
  { "project": "platform/*", "people": ["alice", "bob"] },
  { "project": "*", "people": ["alice"] }
]
```

## 3. Owner side: the "Ready to Merge" button becomes a picker

Today the button tags the change at once. It becomes a button that opens a
small menu, in the same style as the caret on "Review":

```
Ready to Merge  ▾
  ┌──────────────────────────────┐
  │ Ask to merge                 │
  │  ● Alice Example             │  ← mergers for this project, from Settings
  │  ○ Bob Example               │
  │  ────────────────────────    │
  │  Someone else…  [search]     │  ← account search, like adding a reviewer
  │                              │
  │  [Ask Alice to merge]        │
  └──────────────────────────────┘
```

- The list is the mergers for the project of this change. If Settings has
  no row for it, the menu opens on the search field.
- The confirm button is disabled until a person is selected. There is no
  "nobody" option.
- The person asked most recently for this project is preselected. The
  application remembers the last pick per project in the UI state file,
  not in Settings.
- "Someone else" searches accounts on the server (`suggestAccounts`, as
  the team editor does). The picked account is used once and is not added
  to Settings. A small "Add to mergers for platform/*" checkbox under the
  search field saves the one-off pick for next time.
- Enter or the confirm button tags the change and closes the menu. The
  change's row on My Changes then shows the state as "Ready to Merge ·
  Alice Example", so the owner sees who was asked without opening Gerrit.
- In the compact ledger, the main button in the action column stays
  "Ready"; tapping it opens the line and the picker inside the detail row.

Family cards (one Change-Id on several branches): each branch is asked on
its own, as every other action works per row today. A "same for all
approved branches" shortcut is a later step.

After the request, the owner's button is "Change merger", which opens the
same picker with the current choice selected and replaces the `merger:`
tag. "Clear ready-to-merge" is a link in that menu, so the row keeps one
button and the reviewer chips keep their room.

### Showing a name for a username

The tag holds a username; the UI shows the display name. The merger is
usually not on the change, so their account is not in the change data.
The application resolves usernames to accounts with one
`GET /accounts/?q=username:alice` per unknown username, cached for the
session, and falls back to the username itself until the answer arrives or
when the lookup fails. The Settings list and the picker show the same
resolved names.

## 4. Merger side: detection and display

### Model

`classify` reads the `merger:` tag into two new fields on `ChangeView`:

```ts
/** Username or email from the `merger:` hashtag, lower-case, or null for a tag from an old version. */
requestedMerger: string | null
/** `requestedMerger` is me. */
mergeRequestedFromMe: boolean
```

`mergeRequestedFromMe` compares against my own username and email, the
same way `isTeamMember` does. `canMerge` stays as it is: "Gerrit lets me
vote +2 here".

### Fetch

No new query. The direct query already includes `hashtag:ready-to-merge`
for everybody, and the WIP scan already keeps tagged changes. The
application filters client-side, as it does for the team.

### Ready to Merge tab

The tab is the merger's queue. A change named for somebody else is not on
it, so the tab lists only what waits on you.

| Section | Who sees it | Contents |
| --- | --- | --- |
| Asked of you | The named merger | `mergeRequestedFromMe`. Merge button here. |
| Tagged without a merger | Users who can +2 | Old-version tag. Merge button. Transition only. |
| Tagged but no longer approved | The owner | The owner's changes whose tag no longer counts. The named merger is not told: nothing waits on them until the owner re-tags. |

The tab count follows the sections, so it matches the tray.

A user without +2 who is asked by mistake sees the change under "Asked of
you" with a hint: "You cannot vote +2 on this project. Tell the owner to
pick someone else." The application cannot warn the owner at pick time,
because Gerrit reports permitted labels for the signed-in user only.

### Tray and badge

The "merge" count is: asked of me, plus (transition only) tagged without a
merger and I can +2. Changes asked of somebody else do not count and are
not listed. So a team with two leads no longer shows every request on both.

### Desktop notification

`notifyNewReviews` in `App.tsx` already posts a notification when a change
enters "Needs Review" for me. The same hook posts "Merge requested: <subject>"
when `mergeRequestedFromMe` turns true for a change the application has
not shown before.

### Merger actions

| Button | When | Does |
| --- | --- | --- |
| +2 and submit | Asked of me, or tagged without a merger and I can +2 | As today |
| Clear ready-to-merge | As today | Also removes `merger:*` |

No "decline" and no "hand over". If the merger cannot merge, they contact
the developer, who changes the merger or re-requests review.

## 5. What changes in the code

| Area | Change |
| --- | --- |
| `shared/constants.ts` | `MERGER_TAG_PREFIX = 'merger:'` |
| `shared/types.ts` | `Settings.mergers`, `ChangeView.requestedMerger`, `ChangeView.mergeRequestedFromMe`; new action `requestMerge { id, merger }` used for both the first request and "Change merger" |
| `shared/model.ts` | Parse the tag in `classify`; new sections on the Ready to Merge tab; `actionCounts` uses the new rule; `mergersFor(project, settings)` |
| `main/gerrit.ts` | `accountByUsername(username)` for name resolution |
| `main/settings.ts` | Store and normalize `mergers`; remember last pick per project in `ui` |
| `main/service.ts` | `requestMerge`: one hashtag call that adds `ready-to-merge` and `merger:x` and removes any other `merger:*`. `requestReview` and `clear` drop `merger:*` |
| `renderer/actions.ts` | "Ready to Merge" and "Change merger" open the picker; merge button only under "Asked of you" and the transition section |
| `renderer/components/ChangeRow.tsx`, `Ledger.tsx` | Merger's name next to the state on the owner's row |
| `renderer/components/MergerPicker.tsx` | New: list, search, confirm |
| `renderer/components/SettingsPanel.tsx` | Mergers table |
| `README.md` | Workflow steps 6 and 7, the Gerrit data table, the tray table, Settings |
| Tests | `model.test.ts` for the tag parsing, sections and counts; the integration test asks a merger and checks the tags |

## 6. Settled

1. One merger per request.
2. No CC. The application is the only notification channel.
3. Username in the tag, display name in the UI, resolved through an account
   lookup.
4. Every request names a person. A tag without a name is treated as a
   leftover from an old version: visible and mergeable by anyone with +2
   during the rollout, then gone.
5. No merger-side decline or hand-over. The merger merges or talks to the
   developer.

## 7. Also settled

6. The Ready to Merge tab lists only what is asked of you. Requests named
   for somebody else are not shown.
7. The owner's row on My Changes shows the merger's name next to the state.
