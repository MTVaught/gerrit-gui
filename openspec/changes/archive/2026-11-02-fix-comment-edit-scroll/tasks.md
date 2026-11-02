# Tasks

## 1. Preserve inline edit position

- [x] 1.1 Add an Electron regression check that reproduces the Edit jump and verifies comment position, both code panes, focus, and saved identity for single drafts and draft replies in side-by-side and unified layouts, including a thread whose anchor is offscreen.
- [x] 1.2 Keep existing inline drafts in their thread host and focus the editor without a forced reveal. Verify the new regression check passes and document its command in `docs/testing.md`.

## 2. Verify the integrated workflow

- [x] 2.1 Run type checking, unit tests, and existing comment position and reply UI checks. Verify new comments, Save, Cancel, and overview navigation still work.
- [x] 2.2 Record matched light and dark mode videos with real pointer and keyboard input on Linux Electron. Inspect both videos and save verification notes with the test results, fixture limits, and artifact paths.
