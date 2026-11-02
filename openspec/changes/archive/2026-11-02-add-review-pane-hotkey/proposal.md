# Proposal

## Why

The review window lacks Gerrit's Shift+A shortcut to hide the original side of a diff. Reviewers need that space to read the modified file.

## What Changes

- Add Shift+A to hide and restore the original diff pane in embedded and separate review windows.
- Give the modified pane the available diff width while the original pane is hidden.
- Preserve the comparison, file, review state, and split position when restoring the pane.
- List the shortcut in review help and retain the existing typing and modifier guards.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `review-diff-layout`: Add a keyboard toggle for the original diff pane.

## Impact

The review shortcut resolver, local review controller, Monaco review editor, and regression checks change. No server API or dependency changes are needed. Evidence will use real keyboard input in Linux Electron with simulated Gerrit data, recorded in both light and dark modes.
