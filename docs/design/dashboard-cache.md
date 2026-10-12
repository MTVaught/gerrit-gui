# Dashboard cache investigation

An in-memory cache keyed by change is feasible and would prevent confirmed
local writes from being overwritten by stale dashboard searches. The current
application already has the necessary direct-read API and classification
functions. No Gerrit plugin, persistent database, or new client library is
needed for the first implementation.

## Implementation status

`src/renderer/src/dashboard-cache.ts` now owns confirmed board entities and
reconciles every full refresh. Owner actions, sequence edits, review
publication, reviewer removal from the review dialog, and published comment
deletion register their writes with the cache before contacting Gerrit.
Intersecting writes serialize, and all detail reads share a six-request
limit. Server changes and debug identity changes reset the cache; project
and team changes invalidate outstanding searches and recompute membership.

The implementation uses confirmed detail reads rather than optimistic
overlays. Failed or partially successful writes still get a detail read.
If that read fails, the entry stays dirty and the next refresh retries it.
Successful review publication closes the composer even if its board read
fails, with the error shown on the board, so a failed read does not invite
resending an already published review.

The cache compares the fields declared in the application's `ChangeInfo`
type, ignoring extra Gerrit/plugin fields such as detail-only reviewer
updates. It also ignores computed deltas and pagination, normalizes false
privacy/WIP flags and empty request maps, and sorts hashtags and object keys.
Equal-timestamp conflicts still require a direct read.

Automated coverage includes cache ordering, index lag, external changes,
failure recovery, removals, scope changes, sequence edits, read deduplication,
and concurrency limits. `test/dashboard-cache-ui.cjs` drives the built
renderer in light and dark mode and observes every board render while
delayed and stale search responses arrive. It also checks index catch-up and
a subsequent external vote.

Validation passed with 197 unit tests, typechecking, the production build,
and the cache UI regression in both modes. A capture-disabled run of the
existing comments interaction test passed its publication, reviewer,
deletion, and suggested-fix checks, then failed at cross-file draft
visibility. The same failure reproduced in an unchanged `HEAD` checkout.

## What explains the reported jump

The board's mutable state is one `DashboardData` value in
`src/renderer/src/App.tsx`, rather than a cache with reconciliation rules.

1. Re-request sends `requestReview`. `src/main/service.ts` writes the patch
   set history to `review-requested-ps` and removes the in-person marker for
   a pass-around request.
2. `App.act` calls `api.fetchChange` after the write succeeds. This uses
   `/changes/{id}/detail`, which the client intends as the fresh NoteDb read.
3. `withChange` replaces that change in the current board. The new history
   makes the current patch set requested, so it moves to Pass Around.
4. A full refresh can subsequently call `setData(d)` with an older search
   result and discard that replacement. The old request history makes the
   change Iterating again.

`DashboardRefresh` only orders full refreshes against other full refreshes.
Neither `act` nor the local review provider's `onPublished` callback
participates in that ordering. Full refreshes run on window focus, a
45-second timer, explicit refresh, tray requests, and fetch-scope changes.
The `busy` flag does not prevent them.

There are two distinct cases:

- A search started before the write finishes after the direct read.
- A search started after the write still returns the index's older copy.

Invalidating outstanding refreshes on a write fixes only the first case.
The repository already accounts for index lag in `src/main/dashboard.ts`
and `test/integration.test.ts`, but `App` does not preserve that distinction
when it applies results.

I reproduced both cases with an inline Node script using the actual
`DashboardRefresh`, `withChange`, and `classify` functions. A two-patch-set
fixture with an answered first round produced
`iterating -> needs-review -> iterating` in both cases. The existing three
refresh tests pass, but cover identity switching and refresh ordering only.
This proves the rollback is possible in the current code. It does not prove
which refresh trigger or server behavior caused the user's particular run;
that would require a runtime request trace.

The second click succeeding is consistent with the search index catching up
by then. There is no optimistic board update on the first click today: the
initial move follows a successful write and direct read.

## Recommended cache

Create a renderer-owned `DashboardCache` shared by every board update path.
The main service remains the transport and write layer. Electron and browser
mode already share the same renderer and service contracts, so both benefit.

Keep entities keyed by numeric change ID within a server/account context.
Each entry records the confirmed `ChangeInfo`, whether it came from search
or detail, its server `updated` value, a local mutation generation, and any
pending operation. Keep query membership, `fetchedAt`, and `truncated`
separate from entity freshness. A fetch completion time is not a server
revision.

Use these rules:

- Before a mutation, register its affected IDs and advance their generations.
  Capture those generations when reads begin. Discard results made obsolete
  by a later mutation or context reset. Serialize writes to the same change;
  writes to different changes can proceed independently.
- On write success, read the affected changes directly and install the
  confirmed results. Publish the board immediately from those results,
  without waiting for the next full search. Retain a freshness record after
  the operation completes.
- Reconcile search entities individually. Reject older `updated` values.
  An equal timestamp with conflicting board fields must not replace a
  confirmed detail result. Compare canonical server fields, excluding
  computed `review_delta`, pagination markers, and object key order. Treat
  `updated` as a useful ordering hint, not an opaque revision token.
- While a locally changed entry conflicts with or is missing from search,
  revalidate it through detail with bounded concurrency and deduplicate
  simultaneous reads. The detail result can show subsequent votes, patch
  sets, withdrawal, or abandonment. Do not pin the post-action object forever.
- Retire the active reconciliation work when search agrees with the latest
  confirmed entity. Retain the entity's freshness information so a later
  older response still cannot roll it back. Equal-timestamp conflicts need
  direct validation rather than an arbitrary choice.
- Do not interpret omission from a search as proof that a locally changed
  entity disappeared. Keep removal records for changes that leave the board,
  so an older search cannot resurrect them. A detail read and the current
  visibility rules decide removal during reconciliation. Treat permission
  loss or a confirmed 404 as removal; transient read failures are errors,
  not deletion. Handle truncated searches as incomplete membership data.
- Reset the cache and invalidate all read tickets on server/account changes
  and debug identity switches. Recompute membership when projects or watched
  teams change. A detail entity must pass the current project scope, private
  visibility, and merged-age rules before it appears in a query's board.

Build `DashboardData` from reconciled entities and membership, then run the
existing `classifyAll` logic. Notifications, tab counts, and tray state must
use this same reconciled snapshot. Otherwise the row could stay correct
while its count or notification regresses.

Use the cache for `act`, full refresh, local review publication, and all IDs
in `setSequence`. Sequence edits previously fell back to a full search and
need the same protection. Future actions that publish fixes as patch sets
also need to signal the board cache. The current fix actions only modify a
Gerrit change edit, which is published separately in Gerrit.

## Updating before the direct read

The cache above gives reliable updates as soon as the direct read finishes.
For immediate feedback while the write is in flight, add a separate pending
overlay for actions whose effect is known, such as request history, review
kind, WIP, privacy, and hashtags. Keep it separate from confirmed server
data. Replace it with detail after success and remove it on failure.

Gerrit's [REST API documentation](https://gerrit-documentation.storage.googleapis.com/Documentation/3.11.11/rest-api-changes.html)
also specifies that custom-keyed-value writes return the resulting map and
hashtag writes return the resulting tags. The current client returns these
values, but `Service.act` discards them. A typed mutation result could use
those confirmed fields immediately while detail fills in labels, messages,
permissions, and other effects. Do not invent reviewer account records or
assume a review write only changes its submitted vote.

Some actions make multiple writes, so an error can mean partial success.
For example, re-request can remove merge tags before writing request history,
and adding a primary reviewer adds the Gerrit reviewer before its hashtag.
After an error, clear the pending overlay and reconcile through detail.
If detail also fails, preserve the last confirmed data with an error and
retry; a search fallback alone cannot establish what the partial write did.

## Implementation scope and validation

Start with confirmed detail results and reconciliation. Optimistic overlays
can follow separately. This keeps the initial change focused on the reported
rollback and avoids duplicating Gerrit's state changes in the UI.

The implementation touches the cache module and its tests, `App.tsx`'s update
paths, the review components, and board membership helpers. Returning mutation
results in a future change would also change the service/API types, preload,
and HTTP transport.
The original `withChange` helper was reusable, but did not itself enforce
the team query's project scope or the merged query's 14-day limit. Those rules
now apply when reconstructing membership. Direct relationships remain
unscoped by project, matching the existing dashboard queries.

Required regression cases:

- A delayed pre-write search finishes after the fresh detail read.
- A post-write search returns stale request history, including equal
  timestamps, without rolling back the row or its counts.
- Search eventually agrees and reconciliation settles; a subsequent external
  vote or patch set still reaches the board.
- Two writes and detail reads resolve out of order on one change; independent
  changes do not block each other.
- A partial write fails, detail fails temporarily, and retry recovers the
  actual server state.
- Withdrawal, reviewer removal, abandonment, privacy, and incomplete search
  membership cannot resurrect a removed change.
- Sequence edits and local review publication use the same cache.
- Server, account, debug identity, project, and team changes cannot leak
  entries or accept outstanding reads from the previous context.

An asynchronous fixture should drive write, detail, and search responses
independently and verify the rendered section and tab counts. A live Gerrit
test is useful for checking endpoint behavior but should not be the only
regression test, since index timing is nondeterministic.

The remaining uncertainty is the deployed server's exact freshness behavior,
especially for equal timestamps or replica routing. The reconciliation
design deliberately avoids
requiring timestamp uniqueness or a fixed delay for index catch-up.
