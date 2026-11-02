# Proposal

## Why

Clicking Edit on a visible draft moves the comment toward the top of the diff. This breaks the reviewer's reading position when they only want to edit the text.

## What Changes

- Keep the visible comment and diff scroll position fixed when Edit opens its text field.
- Focus the text field and retain the saved draft's identity, anchor, and content.
- Cover single drafts and draft replies in side-by-side and unified layouts.
- Verify the behavior with regression checks and paired light and dark mode videos.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-comment-editing`: Opening an inline draft for editing preserves its visible position and the surrounding diff scroll position.

## Impact

The change affects the inline composer focus and reveal flow in `ReviewComments.tsx`, `InlineReviewComment.tsx`, and, if required, the Monaco view-zone host in `ReviewEditor.tsx`. It adds an Electron UI regression check. No Gerrit API or dependency changes are required.
