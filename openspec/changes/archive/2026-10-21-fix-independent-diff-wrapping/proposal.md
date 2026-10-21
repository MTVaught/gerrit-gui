# Proposal

## Why

With Fit to screen enabled, shrinking one review diff pane forces the wider pane to wrap at the same short column. This wastes available width and makes code harder to read.

## What Changes

- Wrap each diff pane to its own available width when Fit to screen is enabled.
- Preserve the configured column limit when Fit to screen is disabled.
- Preserve source row alignment, linked scrolling, inline comments, and complete-file navigation.
- Verify asymmetric pane widths with the existing 100,000-line fixture and record the fixed workflow in light and dark mode.

## Capabilities

### New Capabilities

- `review-diff-layout`: Independent diff wrapping, row alignment, and navigation during pane resizing.

### Modified Capabilities

None. Existing diff appearance requirements cover theme selection and continuity, not pane wrapping.

## Impact

The change affects `ReviewEditor.tsx` and review UI coverage. It uses the installed Monaco editor and does not change Gerrit APIs, saved preference formats, or dependencies.
