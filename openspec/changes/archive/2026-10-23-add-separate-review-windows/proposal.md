# Proposal

## Why

The current viewer opens each review inside the review board window. Users need to keep several reviews, including several views of the same review, open at once without losing their place or seeing stale settings and review data.

## What changes

- Add a desktop setting, "Open reviews in separate windows", under Settings > Window. It defaults to off and applies to the next in-app review opened from the board or native menu. The existing "Open reviews in the app" setting still controls use of the in-app viewer.
- Give each open action its own window, including repeated opens of the same review. Each window stays on one Gerrit change and can select that change's files and patch sets. It has no review board or route back to the board.
- Keep file selection, comparison, scroll position, dialogs, and unsaved text local to each window. Share saved application and diff settings, saved drafts, comments, votes, and reviewed-file state.
- Make U and app-level exit navigation inactive in separate windows. Escape can still dismiss a dialog or editor widget. The window close button, normal system close shortcuts, and an explicit Close review action close only that window, with the existing unsaved-edit and pending-write protection.
- Refresh other views after a confirmed write and protect unsaved text from concurrent draft changes. Show conflicts rather than silently overwriting another window's work.
- Preserve the default embedded viewer, explicit Gerrit links, and browser-mode behavior.

## Capabilities

### New capabilities

- `review-windows`: Optional review-only desktop windows, their independent view state, close behavior, and shared review data.

### Modified capabilities

- `native-review-navigation`: Choose the configured review destination, with independent startup delivery for each separate window.
- `review-preferences`: Apply saved preference changes across open desktop reviews without losing concurrent edits or changing Gerrit account preferences.

## Impact

The work affects Electron window creation and lifecycle, trusted IPC and preload APIs, settings storage, renderer startup, the review provider and viewer, review mutations, and board refresh handling. It also needs tests for multiple real windows and paired light/dark recordings with simulated Gerrit data. No new external dependency is planned. Browser popups, independent app processes, and live collaborative text editing are outside this change.
