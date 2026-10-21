# Design

## Context

See `proposal.md` for the defect and scope. The reproduction and server evidence are in `docs/investigations/ported-reply-duplication.md`.

`ReviewComments.tsx` uses `replyAnchor()` for typed replies, quoted replies, Ack, and Done. That function chooses a display mapping before the original anchor. The REST client writes the supplied anchor without changing it. The current UI regression expects the faulty mapped coordinates.

The component already separates original comments from server display positions, but its composer has only one anchor. Before autosave it has no draft ID. After autosave, `LocalReview.tsx` can still have a cached positions list without that ID. `onReveal(result)` can therefore navigate to the old patch set if the saved reply now retains its original anchor. A write-only replacement of `replyAnchor()` would leave a placement and navigation regression.

The existing `review-comment-overview` and `native-review-navigation` specs protect review continuity. Neither requires replies to be saved at mapped coordinates. The conflicting expectation is in the simulated UI test, not the main specs.

## Goals / Non-Goals

**Goals:**

- Keep one canonical anchor for every reply write and a separate reference for its mapped display location.
- Use existing Gerrit endpoints and publication settings.
- Make the regression observable through actual renderer requests and Gerrit's web diff.

**Non-Goals:**

- Repair or relocate previously saved drafts and published comments with mismatched anchors.
- Hide duplicates by changing comment grouping or filtering Gerrit's web output.
- Change mapping algorithms, votes, new standalone comments, review summaries, or publication defaults.

## Decisions

### 1. Copy the immediate parent comment's original anchor for every response

Use one original-anchor conversion for Reply, Quote, Ack, and Done. Preserve `patch_set`, path, side, merge parent, line, and range. Keep the immediate reply target's ID in `in_reply_to`. Use the existing default of REVISION when the server omits side.

This matches the original-anchor control on Gerrit 3.11.2. The REST client and service remain responsible for transport only. Rewriting coordinates there would require loading parent comments and would conceal the renderer's incorrect request.

Do not use the oldest thread root unconditionally. A response is tied to the selected latest published comment, and old data can already contain mixed anchors. Do not migrate that data in this change.

### 2. Resolve display placement independently of the write anchor

Keep the composer's saved anchor canonical. Resolve display placement from the reply target while the composer has no ID, and continue using that thread reference while a new draft ID has no server mapping. Prefer a direct server mapping when available. Any temporary association must be scoped to the change, comparison, and draft or composer lifecycle and cleared when that context ends.

Use this display resolution for the inline composer, draft reveal after Save, and editing a reply through the publish dialog. A reply to a visible mapped thread must not open a second fallback dialog or switch to the older comparison because its canonical anchor is offscreen. Reuse the known parent thread location for immediate reveal; refresh comment positions only when needed for an independent saved-draft position. Do not refetch full source files to update comment placement.

Keep the initial composer reveal active while a newly opened large diff settles its layout. The existing first-visible-frame focus shortcut can finish before a later layout hides the zone. Use a bounded initial retry window and require stable visible focus before it ends; cancel the retry when the host or composer changes. The combined large-file UI workflow must check that an older cross-file reply is visible and can receive text without manual scroll correction.

If a shared helper is needed in `review-comments.ts`, use it in the affected `ReviewComments.tsx` and `LocalReview.tsx` display paths so their placement rules agree. Follow parent IDs only through known discussion data, with cycle protection. Mapping absence must retain the existing original-location fallback rather than guess a new position.

Adding only `anchor(comment)` at the write call was rejected because the current synthetic composer lookup lacks an ID and the position cache can miss new draft IDs. Saving both old and mapped anchors as if both were authoritative was rejected because it would leave ambiguous write behavior.

### 3. Preserve draft lifecycle and publication scope

Autosave creates one draft; subsequent Save and resolution changes update that ID at its saved patch set. Existing edit and cancel paths already retain original coordinates and must keep doing so. Cancel of a new reply and discard must delete from the saved patch set, even when viewing another comparison.

Keep the current `PUBLISH_ALL_REVISIONS` default and draft-ID selection. A reply saved on patch set 2 is included when publishing all drafts from patch set 3, excluded when publishing only patch set 3, and retained with KEEP. Keep the draft count and location listing consistent with that scope. Do not move replies to satisfy the selected publication scope.

### 4. Check the request and the Gerrit web result

Unit tests cover original anchor preservation and independent display placement. Extend the existing UI workflow to test typed and quoted replies, Ack and Done, autosave updates, and cancel or discard. Replace the historical fixture assertion for patch set 3 and mapped line 14 with patch set 1, `old-scheduler.ts`, line 9998. Add range, merge-parent, renamed-path, chain, and publication-scope cases where each distinct branch needs coverage.

Use a throwaway seeded Gerrit 3.11.2 for an automated regression that drives the built renderer with real input. Record actual requests and compare stored IDs with the web diff's thread data. Assert one reply in storage, the original parent and anchor, and one visible occurrence in the original thread after publication. Separate parent and reply timestamps in fast API setup to avoid unrelated whole-second ordering effects.

The existing `test/reproduce-ported-reply.ts` deliberately sends the bad payload. Keep it as a documented diagnostic and control, or extract its fixture setup for the new renderer-driven regression. Passing that diagnostic alone does not verify the application fix.

Capture and inspect light and dark recordings with the `record-actions` workflow. Each recording must show opening the older thread, typing once, autosave, explicit publication, and one reply in the real Gerrit web diff. Use matching screenshots for the same final change and scroll position. Preserve the investigation captures as the before state and identify generated data and Linux as the tested platform.

## Risks / Trade-offs

- A new draft ID has no cached display mapping. Mitigate with the known parent-thread display reference until direct mapping is available.
- A stale temporary mapping can survive a comparison change. Scope and clear temporary references by change, comparison, and draft lifecycle; test navigation and reopen behavior.
- Copying only the patch set can still break renamed, ranged, or base-side threads. Preserve and test the full original anchor.
- Existing malformed replies can remain malformed when edited. Preserve their saved anchors and document that repair is outside this fix.
- The in-memory fixture joins IDs across patch sets and cannot prove Gerrit's web rendering. Require the real-server regression and inspected captures.

## Migration Plan

No data or settings migration is required. Ship the renderer correction with its tests through the normal application build. Existing saved drafts retain their IDs and coordinates. Roll back by reverting the code change; do not delete or rewrite Gerrit comments. Keep the before and after evidence for review.
