# Design

## Context

See proposal.md for the reproduced symptoms. LocalReview currently has one marking boolean for every file. Its review-change subscription reloads reviewed flags and sets them to null before each read. ReviewFileList then renders every null flag as unreviewed and disables all status buttons. The main process already serializes confirmed review writes and notifies open views.

## Goals / Non-Goals

Goals are independent file input, immediate local feedback, and safe reconciliation with confirmed Gerrit state. Apply one state model to sidebar, header, shortcuts, automatic marking, progress, and filtering. Keep close protection for all outstanding writes, including writes on a patch set no longer selected.

Do not change Gerrit endpoints, server write ordering, comment refresh, permissions, or automatic-marking preferences. No dependency or persisted-data migration is needed.

## Decisions

Use a small renderer state object for each change and patch set. Keep the known flag set, pending file paths, read sequence, local write revision, and file-specific save errors. Update only the clicked flag before awaiting its write. Disable only that file while pending. On failure, restore that file's prior value and retain its error. Other files remain independent. A single global lock was rejected because it drops the reproduced input.

Keep known flags during refresh. Read results apply only if their request is current and the local write revision has not changed. Skip full-list reads while local writes remain pending, then request reconciliation when writes settle. This avoids accepting a server list that contains only part of a queued batch. A longer debounce alone was rejected because latency remains variable.

Cache state per target revision during the review session so returning to a patch set preserves its pending-file protection. Retain the existing all-revision pending-write set for closure checks. Scope async callbacks to the state object that started the operation. Background refresh success clears only read errors. A new attempt clears that file's save error. The explicit Retry action clears errors and reloads confirmed flags; the reviewer can then change the failed file again.

Add deterministic tests with deferred promises for stale reads, independent writes, rollback, retry, and revision separation. Use the production desktop and preload against a simulated Gerrit service for input, shared-window, and capture checks. Repeat the original five-file sequence in both themes, with the same view and delays.

## Risks / Trade-offs

- A pending file cannot be toggled again until its write completes. This keeps one clear save outcome per file while allowing work on other files.
- An external flag change waits behind local pending writes before reconciliation. The final read includes confirmed server state.
- The display uses optimistic flags before confirmation. Failed writes restore only their file and retain a visible error.
- Renderer state is session-local. Closing protection still depends on the existing pending-write tracking and main-process queue.
