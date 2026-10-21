# Design

## Context

`LocalReview` uses a native dialog cancel event to close the review. Its shortcut capture handler ignores text input and has no Escape shortcut. The shared comment form handles save keys but lets Escape reach the browser's dialog dismissal. `cancelEdit` already deletes new autosaved drafts, restores existing drafts, and blocks changes while a write is pending.

## Goals / Non-Goals

The form must own Escape from all its controls, including suggested fixes and reply editors rendered through React portals. Keep the review summary dialog's existing dismissal rules and the draft API unchanged.

## Decisions

Handle Escape in the shared form's keydown handler. Prevent the native default action and stop propagation before calling `cancelEdit`. This gives the key the same pending-write and error behavior as Cancel. A review-wide handler would duplicate composer state and interfere with nested dialogs.

Use the existing Electron fixture to verify new comments, autosaved replies, saved draft edits, suggested-fix fields, pending writes, save shortcuts, and review dismissal outside a composer. The fixture simulates Gerrit data and storage; the renderer and keyboard inputs are real.

Capture paired light and dark videos on Linux using an isolated Xvfb display, a visible pointer, two-second hover pauses, and captions before Escape. Show a new reply autosave, Escape cancellation, draft deletion, and the open review. Inspect both videos before sharing them.

## Risks / Trade-offs

- Native dialog defaults can close the review even if propagation stops. Prevent the default action and test with real key input.
- A pending write temporarily blocks cancellation. Consume the key and let the user retry after the write completes, matching Cancel.
- Cancellation can fail at the server. Keep the existing visible error and open composer, then test retry.

## Migration Plan

No data migration is needed. Revert the form handler to roll back the behavior.
