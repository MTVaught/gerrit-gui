# Proposal

## Why

The review resets the divider between the original and modified code when a reviewer opens another file. Reviewers must repeat the same adjustment for each file.

## What Changes

- Keep one shared divider ratio for the open review window.
- Use the latest ratio for newly opened files, cached files, and patch set comparisons.
- Keep file scroll and cursor state separate from the shared divider position.
- Verify file switching with real pointer input and paired light and dark recordings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-diff-layout`: Retain the original/modified divider ratio across files in a review window.

## Impact

The change affects `LocalReview`, `ReviewEditor`, and the Electron UI checks. It needs no new dependency or server API. The ratio belongs to the open review window; persistence after closing the review or restarting the app is outside this change.
