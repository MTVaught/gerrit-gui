# Native review navigation verification

The paired videos show real pointer input on Linux with Openbox and the Xfce system tray. They use the real built app, preload, native menus, settings store, Gerrit client, and review viewer. Only Gerrit responses are simulated by `test/fixtures/native-review-server.cjs`. The external destination is the fixture's Gerrit page in an isolated Chromium browser.

Each video starts in Settings > Beta with the preference off. The user enables "Open reviews in the app", closes the window, and selects change #2481 from the tray's Needs Review submenu. The app restores and opens patch set 3 compared with patch set 1. The user then disables the preference, closes the window, and selects the same native menu entry. Chromium opens the original `/c/telemetry/+/2481/1..3` URL while the app stays hidden.

- [Light-mode video](native-review-light.mp4)
- [Dark-mode video](native-review-dark.mp4)
- [Light-mode review result](native-review-light.png)
- [Dark-mode review result](native-review-dark.png)

Both videos use a 1440 by 1000 desktop, fixed fixture data, the same window position, and the same input sequence. Pointer moves take about one second, followed by a two-second hover before each click. Captions describe the actions and results. App theme changes use the real Appearance setting. The Linux desktop panel and native menu keep their system theme.

## Automated checks

- `pnpm typecheck` passed.
- `pnpm test` passed all 348 tests. Native routing tests include grouped branch and sequence members, all four categories, opt-out destinations, preference changes, metadata errors, stale responses, startup readiness, and request acknowledgment.
- `pnpm build` passed.
- `xvfb-run -a node_modules/.bin/electron test/native-review-ui.cjs` passed.
- `REVIEW_NATIVE_COMPACT=1 xvfb-run -a node_modules/.bin/electron test/native-review-ui.cjs` passed.
- `xvfb-run -a node_modules/.bin/electron test/owned-review-ui.cjs` passed.

The renderer checks use simulated native request events. They verify Settings dismissal, normal and compact layouts, selected member identity and comparison, same-change comparison replacement, duplicate requests, unsaved-edit cancellation, pending-write protection, saved-draft retention, visible error recovery, and explicit browser actions. The videos provide separate proof of real native clicks and hidden-window restoration.

Native Windows and macOS behavior was not recorded. Existing platform-specific tray click unit tests pass.

Both exported videos are 71.32 seconds, with H.264 video and `yuv420p` pixels. Full decoding passed. Inspection of result frames and frames across each sequence confirmed readable captions, visible pointer input, menu selections, restored comparisons, and browser destinations in both modes.

## Capture setup

The capture uses the `record-actions` skill's isolated desktop method. `test/fixtures/native-review-desktop.cjs` loads the production main entrypoint and writes read-only UI observations for input targeting. The loopback fixture listens on `127.0.0.1:5197`; `GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1` enables that test connection. Fixture credentials are entered into the real connection form and kept in the isolated session. No real account is used.

Xvfb, Openbox, Xfce, xdotool, FFmpeg, and the cached Chromium binary supply the desktop. The distro `xdg-utils` package is extracted into a temporary directory for URL dispatch, without a system package installation. The vendor Electron sandbox helper is used with its required owner and permissions; its prior owner and permissions are restored after capture. Temporary desktop processes and the fixture server are stopped after capture.
