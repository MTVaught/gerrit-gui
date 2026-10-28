# Proposal

## Why

Rapid clicks on reviewed files lose input because one pending write disables every file-status button. Each successful write also clears the complete status list during refresh, so all checkmarks flash and appear to return.

## What Changes

- Apply each flag change to the visible file at once and keep unrelated file controls available during saves.
- Keep known flags visible while the same patch set refreshes.
- Prevent late reads from replacing pending or newly saved flags.
- Restore only a failed file change and keep the error and retry action available.
- Verify rapid input, refresh timing, failures, patch-set changes, and shared saved state. Record the corrected workflow in both themes.

## Capabilities

### New Capabilities

- `reviewed-files`: Reliable per-file reviewed flags, progress, refresh, and save recovery within an in-app review.

### Modified Capabilities

None. Existing cross-window notification and close protection requirements remain in effect.

## Impact

Changes affect LocalReview, ReviewFileList, renderer flag-state management, and focused regression tests. Gerrit endpoints, main-process write ordering, permissions, and dependencies remain unchanged. Evidence uses the production Linux Electron app with a simulated Gerrit service and real mouse input.
