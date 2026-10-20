# Proposal

## Why

The review file pane starts at 240 px and cannot expand past 360 px. Long file names and folder paths stay truncated even when the user makes the window larger.

## What Changes

- Default the file pane to the width needed by its visible folder paths and file rows, including status controls and line counts.
- Limit the pane to half of the review body so the diff keeps usable space. Wrap text that cannot fit, including long names with no spaces.
- Keep pointer and keyboard resizing. Replace the fixed 360 px limit with a limit based on the available review width.
- Use the same behavior in light and dark mode.

## Capabilities

### New Capabilities

- `review-file-navigation`: Readable file and folder labels and adjustable pane width in the review window.

### Modified Capabilities

None.

## Impact

Changes are limited to `ReviewFileList.tsx`, review styles, and Electron UI fixtures and checks. No API, dependency, saved setting, or native window limit changes are needed.
