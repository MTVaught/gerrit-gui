# Design

## Context

See proposal.md for the reported failure. `ReviewedFilesState.resetAll` already waits for each confirmed delete and protects its final read from stale local responses. The defect is in Gerrit's server state. Gerrit 3.11.2 finds the latest patch set with at least one reviewed row. If the selected patch set has no rows, its next reviewed-list read can copy unchanged paths from an older patch set. The existing loopback fixture only stored independent sets, so it missed this behavior.

## Goals / Non-Goals

**Goals:** Keep empty review state on the server across new renderer state and client instances. Keep the existing per-file API, mutation queue, permissions, and error handling.

**Non-Goals:** No server configuration changes, local review overrides, changes to older patch-set flags, or changes to automatic-marking preferences.

## Decisions

### Save an internal pseudo-path before deleting a flag

Before each unreview DELETE, `GerritClient.setFileReviewed` sends an idempotent PUT for `/GERRIT_GUI_UNREVIEWED` on the same change and target patch set with the same authenticated user. This leaves a review row even when no actual file is reviewed. The leading slash keeps the marker separate from repository file paths. Gerrit's file resource accepts the pseudo-path, as verified against 3.11.2.

Saving before deletion prevents another window's read from finding an empty patch set between those requests. A failed marker save stops the delete and uses the existing save-error path. Repeating the PUT avoids a client cache that could be wrong after an external change.

A local override would not survive another client or affect Gerrit's saved state. Clearing older patch sets would destroy review history outside the selected scope. Repeating deletes after every read would not stop inheritance. None of those alternatives provides the required saved state.

### Remove only the marker from reviewed-list responses

`GerritClient.reviewedFiles` filters the exact marker path before returning data. Counts, filtering, automatic marking, and reset snapshots continue to use their existing shared state. Other pseudo-files, including `/COMMIT_MSG`, remain unchanged. Ordinary reviewed PUTs keep their existing behavior.

### Test real server inheritance

Add a stateful client regression that models Gerrit's fallback and checks fresh-client reads, older patch-set preservation, normal marking, and the last individual clear. Add a marker-save failure check. Update existing desktop checks and recording runners to distinguish real-file deletes and flags from the internal marker.

Use a real throwaway Gerrit 3.11.2 desktop check to reproduce the failure with REST calls before testing the fixed button with X11 input. Check filtered files, reopen persistence, older patch sets, and another user. Capture matched light and dark videos with visible pointer movement, two-second hovers, and captions. Export captions after recording to avoid FFmpeg live-text corruption.

## Risks / Trade-offs

- Each clear adds one PUT. Keep it idempotent and preserve the existing sequential bulk-reset guard.
- Gerrit stores an internal pseudo-path row. Hide only that exact path in app responses and document it in the testing guide. Raw REST consumers can see it.
- The real-server check covers Gerrit 3.11.2 on Linux Electron. Other Gerrit versions and native Windows or macOS need separate acceptance checks.
- Removing the client workaround can expose inherited flags again. A rollback does not delete the existing server marker; it remains harmless metadata.

## Migration plan

No local data migration is required. The first clear writes the server marker for that user's target patch set. Deploy the client and tests together. Existing reviewed files stay unchanged until the reviewer clears them.
