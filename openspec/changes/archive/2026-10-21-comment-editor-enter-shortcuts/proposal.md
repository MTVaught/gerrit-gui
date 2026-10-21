# Proposal

## Why

Reviewers need Enter to add a line while editing a comment. Inline comment fields must receive their keyboard input before Monaco can consume it.

## What Changes

- Keep Enter and Shift+Enter as newline input in comment text fields.
- Save and close the comment with Cmd+Enter on macOS or Ctrl+Enter on other platforms.
- Protect inline comment input from Monaco keyboard handlers, including replies and existing draft edits.
- Retain autosave, the Save button, and existing Ctrl+S and Cmd+S shortcuts.

## Capabilities

### New Capabilities

- `review-comment-editing`: Keyboard input and explicit save behavior for review comment composers.

### Modified Capabilities

None.

## Impact

The inline view-zone event boundary in ReviewEditor, the shared composer in ReviewComments, keyboard help, and Electron UI checks are affected. No server API or dependency change is needed. Evidence will use real keyboard input against the in-memory Gerrit fixture in Linux Electron, with comparable light and dark recordings. Native macOS and Windows verification will be reported separately from simulated modifier checks.
