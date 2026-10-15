# Proposal

## Why

The reviewer's All comments dialog is only 560 px wide, and its Close button follows the full comment list. Reviewers need more space to read threads and a clear way to return to the code without scrolling.

## What Changes

- Expand All comments to about 90% of the review window width, with a visible margin around it.
- Keep the title, filters, and a labeled Back to review button visible while the thread list scrolls.
- Close the dialog with Back to review, Escape, or a click on the dimmed background. Clicks inside the dialog keep it open.
- Preserve the review's selected file, comparison, and code position when dismissing the dialog. Keep comment-location navigation working.
- Use the same layout in light and dark mode, based on the application previews discussed in this thread.

## Capabilities

### New Capabilities

- `review-comment-overview`: Layout, navigation, and dismissal of the reviewer's All comments dialog.

### Modified Capabilities

None.

## Impact

The change affects `ReviewComments.tsx`, the related rules in `styles.css`, and review UI checks. Other dialogs share the current SendReview helper, so the new layout and background dismissal must apply only to All comments. No server API, data model, or new dependency is required.
