# Design

## Context

See [proposal.md](proposal.md) for the defect and scope, and the [investigation](../../../docs/investigations/draft-autosave-conflict.md) for actual requests. The current renderer records a version from each PUT response, then compares it with discussion reads after mutation notifications. The desktop main process uses the same `draftVersion()` function before updating or deleting a saved draft. Gerrit 3.11.2 retains milliseconds in the PUT response but truncates them in persisted GET responses.

Overall summary anchors include a display side. `GerritClient.saveDraft()` currently forwards that field to the REST endpoint, which rejects it for `/PATCHSET_LEVEL`. The current HTTP fixture stores and returns the same timestamp for both operations and accepts that invalid payload. The preload fixture bypasses REST serialization.

## Goals / Non-Goals

Goals are consistent version comparison at both existing check sites, valid REST serialization for every overall draft write, and regression coverage using the observed server contract. Preserve serialized desktop writes, notification delivery, private draft storage in Gerrit, and the existing comment anchor rules.

This design does not change autosave delay, window routing, conflict UI, publication scope, or credential handling. It adds no automatic cleanup of duplicate drafts and no distributed lock for external Gerrit clients.

## Decisions

### Normalize the timestamp inside the shared version function

Convert recognized Gerrit timestamp strings to their whole-second form before including them in `draftVersion()`. Truncate fractional digits; do not round or parse through a local-time date conversion. Handle both a fractional timestamp and its whole-second representation. Preserve unknown timestamp formats unchanged so test sentinels and unexpected server values do not collapse into one value.

Keep the remaining version fields, including ID, message, resolution, suggestions, path, patch set, side, line, and range. Preserve the original `updated` value on comment objects for display. Both the renderer's refresh check and the desktop pre-write guard obtain the same rule through their existing import.

This is preferred to an extra GET after every PUT. A failed follow-up read would otherwise turn a confirmed save into an ambiguous failure. Suppressing the originating window's notification would leave the pre-write guard and polling mismatch in place. Removing timestamp or content checks would weaken stale-write detection.

The unit tests must show that fractional precision alone compares equal while different stored seconds and different content within one second still compare unequal. Existing queued-write and deletion/publication guards remain active.

### Strip overall source positions at the REST boundary

In `GerritClient.saveDraft()`, build a separate request body for `/PATCHSET_LEVEL` with `side`, `line`, `range`, and `parent` omitted. Apply this rule to creation and updates. Preserve ID routing, message, resolution, and any other supported non-position fields. Do not mutate the caller's input object.

Keep internal display anchors and `CommentAnchor` types as they are. For ordinary source comments and replies, retain the existing payload, including original patch set, source position, merge parent, reply ID, and suggestions. Central serialization covers browser and desktop service callers and avoids duplicating special cases across summary creation, editing, and cancel restoration.

Changing only `review()` would leave other callers exposed. Weakening a global anchor type would spread an unrelated display change through the editor.

### Model persisted responses separately in regression fixtures

Update the HTTP fixture in `test/fixtures/review-windows-server.cjs` to return fractional PUT timestamps and whole-second persisted GET timestamps. Use deterministic nonzero fractions so the failure cannot disappear when a write lands on an exact second. Reject forbidden source-position fields on overall REST drafts.

The high-level preload fixture in `test/fixtures/local-review-preload.cjs` must model separate saved/read objects and timestamps. It must not reject an internal summary anchor merely because it includes a display side; wire-payload validation belongs in the HTTP fixture and real client tests.

Extend `src/main/review-mutations.test.ts` and `src/main/review.test.ts` for version and serialization checks. Extend the existing comment and review-window workflows for successive saves, recovery from real conflicts, and the summary lifecycle. Use the investigation harness as the starting point for a real-server regression with passing assertions; retain the original investigation evidence as the pre-fix record.

## Risks / Trade-offs

- Whole-second timestamps cannot identify all identical-content rewrites within one second. Retain content and anchor comparison, and test actual changed text and resolution in that interval. Gerrit's API still provides no atomic comparison against arbitrary outside writers.
- A normalization rule that accepts arbitrary timestamp text could hide a real difference. Limit it to recognized Gerrit shapes and test unknown values explicitly.
- A broad payload cleanup could relocate source replies. Limit cleanup to `/PATCHSET_LEVEL` and run the existing original-anchor regression.
- Server behavior can differ from permissive fixtures. Use real local Gerrit 3.11.2, dummy accounts, and production desktop IPC for acceptance, in addition to fixture tests. Report the platform and any version not tested.

## Migration Plan

No stored-data migration is needed because expected versions live in the app process. Restart or reopen the affected review after updating to discard old expected versions and paused composer state. Keep existing saved duplicates available for manual inspection. Rollback restores the prior code and does not change draft storage.

## Verification and evidence

Run focused version/client checks, the comment and window UI workflows, the existing real-server reply-anchor regression, `pnpm test`, `pnpm typecheck`, and `pnpm build`.

Use a new throwaway Gerrit 3.11.2 for real-server acceptance. In one embedded review, type a draft, wait for autosave and its notification, edit again, use Save, reopen, and verify one stored ID and the latest text. Exercise line, file, range, and reply drafts. Verify creation while typing, cancel restoration, discard, and a failed update followed by retry. Repeat the own-save case in a separate review window.

In two windows, make a real conflicting edit within one stored second, verify stale update/delete rejection, then exercise Load saved version and Keep as new draft. The latter must create exactly one new ID that accepts further autosaves. Delete/publish the other active draft and verify retained local text and paused stale saves.

Verify Reply summary creation, subsequent autosave, reopen, clear/delete, replacement, Keep drafts private, and publication. Inspect actual REST bodies and stored IDs, not only status text.

For the proposal, capture a report generated from artifact existence, validation, and scenario/task counts in matched light/dark screenshots. It demonstrates the completed plan only. During implementation, use the record-actions skill for paired real-input videos of the corrected single-window, summary, and real-conflict recovery workflows, plus saved request/storage evidence. Inspect both themes and record any capture or platform limit.
