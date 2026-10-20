# Proposal

## Why

Users who enable "Open reviews in the app" still reach the Gerrit website when they select a change from the native tray menu. The native menu must respect the same preference as the board's review controls.

## What Changes

- Open enabled change entries from the system tray or macOS menu bar in the existing app review viewer when `localReview` is enabled.
- Restore and focus the app window, then open the selected change and patch set comparison. Deliver requests only after the renderer can receive them.
- Preserve the Needs Review comparison. For other categories, open the current patch set against base.
- Apply preference changes to the next selection without an app restart. With opt-in disabled, retain each entry's current Gerrit URL.
- Keep category navigation, icon click settings, disabled entries, counts, and explicit browser links unchanged.

## Capabilities

### New Capabilities

- `native-review-navigation`: Open changes from native tray menus in the destination selected by the user's review preference, with reliable window activation and request delivery.

### Modified Capabilities

None.

## Impact

The change affects native menu callbacks in `src/main/tray.ts` and `src/main/index.ts`, menu data in `src/shared/model.ts` and `src/shared/types.ts`, and the main-to-renderer API in `src/shared/api.ts` and `src/preload/index.ts`. The renderer needs a request handler in the existing review provider, plus a browser-mode no-op subscription. Tests must cover routing, request delivery, and draft protection. No new package or settings migration is required.

Scope assumption: "taskbar/toolbar" means the system tray and macOS menu bar. Every enabled change entry in those menus uses the preference. This proposal does not add an OS taskbar toolbar or change the app's tab toolbar.
