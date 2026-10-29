# Proposal

## Why

A reviewer who wants to start a review again must clear each file's reviewed flag separately. A single button in the file list will reset that progress for the selected patch set.

## What Changes

- Add a compact crossed-out checkmark glyph in the Files heading beside the reviewed count, with the accessible name and tooltip "Mark all unreviewed".
- Clear the signed-in user's reviewed flags for the selected target patch set, including files hidden by the filter or absent from the selected comparison.
- Show pending work and errors. Keep confirmed partial results and allow the user to retry the remaining files.
- Keep the selected file and comparison. Prevent automatic marking from immediately reversing the reset in the current file visit.
- Require paired light and dark video evidence of the implemented workflow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-file-navigation`: Add a bulk reset of reviewed-file progress from the file list.

## Impact

The change affects `ReviewFileList.tsx`, `LocalReview.tsx`, file-pane styles, and renderer tests. It reuses `setReviewFileReviewed` and Gerrit's existing per-file DELETE operation. Existing service permission checks, write serialization, and cross-window refresh remain in use. No new dependency is needed.

This proposal covers reviewed flags only. It does not delete comments or drafts, change votes, reset other users or patch sets, add an undo action, or add a confirmation dialog.
