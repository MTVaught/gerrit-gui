# Design

## Context

See proposal.md for the reported problem. `ReviewEditor.tsx` currently computes one wrap column from the smaller content width and sends it to both Monaco editors. A layout listener repeats that calculation after resizing. The comment documents a workaround for alignment spacer creation. The existing Electron UI suite loads a 100,000-line fixture and checks scrolling, comments, preferences, and navigation.

This design is needed because unequal wrapping can affect alignment performance. Monaco's installed diff view computes extra heights from wrapped source lines and inserts alignment view zones.

## Goals / Non-Goals

Goals are to use the editor's viewport wrapping, remove the shared width calculation, and verify the resulting layout through actual divider input. Keep source models, Gerrit diff mappings, preference persistence, and comment handling intact.

Changing diff computation, replacing Monaco, upgrading dependencies, or redesigning the review controls is out of scope.

## Decisions

Use `wordWrap: 'on'` when Fit to screen is enabled and `wordWrap: 'wordWrapColumn'` otherwise. Keep `diffWordWrap: 'inherit'` and the saved `wordWrapColumn`. This lets Monaco calculate each editor's own content width, including gutters and font metrics. Remove the shared fitting function and animation frame scheduling. Keep the layout callback for visible tab decorations.

The alternative is to calculate a separate numeric column for each editor. That adds resize scheduling and duplicates the editor's width calculations without a demonstrated benefit.

Retain Monaco's row alignment. Blank space in the wide pane is necessary when a matching line occupies more visual rows in the narrow pane. Forcing both panes to the same wrap width hides that layout difference but causes the reported bug.

Add an Electron regression workflow using the existing complete-file fixture. Assert actual rendered source line fragments and line number positions after dragging in both directions. Check resizing, saved column mode, linked scrolling, navigation, comment anchors, and the existing review workflow. Record comparable pointer actions and captions in light and dark mode with `record-actions`.

## Risks / Trade-offs

- Unequal wrapping can create many alignment view zones. Measure resize time, navigation time, rendered zones, and DOM size against the 100,000-line fixture. Check responsive navigation rather than enforcing the old shared-width spacer count at unequal widths. If this exposes an unusable result, address alignment cost within this change before accepting the fix.
- Font metrics and gutter changes alter the exact wrap point. Assert that a known source line fits or wraps and matching source rows align, rather than duplicating Monaco's column calculation in tests.
- Divider input can miss a stale sash after layout changes. Locate its current rendered bounds before each drag and assert the resulting pane widths.

## Migration Plan

No data migration is required. Build and ship through the existing application workflow. Reverting the editor options and shared fitting removal restores the former behavior without changing saved preferences.
