# Proposal

## Why

The review comment editor includes suggested-replacement controls alongside ordinary comment actions. Remove these controls to simplify comment entry.

## What Changes

- Remove the selected-range replacement button and suggestion fields from the comment editor.
- Keep comment text, formatting preview, resolution, autosave, Save, and Cancel.
- Preserve existing draft suggestion data during edits and cancellation. Keep existing comment suggestion display, preview, and apply behavior.
- Verify the editor with a selected revision range and capture matching light and dark screenshots.

## Capabilities

### New Capabilities

- `review-comment-composition`: Comment entry controls and safe editing of stored comment data.

### Modified Capabilities

None. The existing overview spec preserves suggested-fix preview behavior, which this change retains.

## Impact

`ReviewComments.tsx`, the Electron comment UI checks and fixture, and comment workflow documentation. No server API or dependency changes.
