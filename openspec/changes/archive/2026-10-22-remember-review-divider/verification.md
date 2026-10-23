# Verification

## Environment

The checks run the built renderer in Linux Electron 44 under Xvfb. The existing preload supplies simulated Gerrit changes, file contents, comments, and API responses. Divider dragging and file selection in the recordings use X11 pointer input. The production review, editor, navigation, and file view-state code runs unchanged by the fixture.

## Checks

- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `pnpm test`: 359 passed, zero failures.
- `openspec validate remember-review-divider --strict`: passed.
- `test/review-divider-ui.cjs`: passed in light and dark mode. Covers new files, cached files, a second divider adjustment, per-file scroll and cursor restoration, minimum pane widths, window resizing, comparison changes, and closing/reopening.
- `test/review-ui.cjs`: passed. Covers navigation, search, file caching, preferences, patch set comparisons, reviewed flags, and a bounded rendered file view. No renderer or worker errors.
- `test/review-wrapping-ui.cjs`: passed in light and dark mode. Covers independent wrapping, source-row alignment, linked scrolling, comment anchors, saved column wrapping, window resizing, and complete-file navigation.
- `test/review-comments-ui.cjs`: passed on rerun, including comment focus, drafts, range selection, file switching, review reopening, and both-theme comment overview checks. An initial run timed out while waiting for draft keyboard focus. The unchanged commit `14f0dc2` also passed the full check in a separate temporary checkout.

## Reproduce

Build with `pnpm build`, then run:

```sh
REVIEW_DIVIDER_VIDEO=1 xvfb-run -a -s '-screen 0 1440x960x24' node_modules/.bin/electron test/review-divider-ui.cjs
```

New captures go to `docs/screenshots/review-divider` by default. Set `REVIEW_DIVIDER_OUTPUT` to use another directory. The implementation recordings stay with the archived change.

The Electron sandbox helper must have the ownership and mode required by the repository's `scripts/ensure-electron.mjs` on Linux hosts that restrict unprivileged user namespaces.

## Recordings

- [Light mode](evidence/shared-divider-light.mp4)
- [Dark mode](evidence/shared-divider-dark.mp4)
- [Check results](evidence/checks.json)

The paired recordings show the same files and actions at 1440 by 960. Each sequence drags the divider left, opens another file, drags right, and returns to the cached file. Captions identify the actions and simulated data. Closing the review starts a fresh layout on the next open. macOS and Windows were not tested.

Both videos use H.264 with `yuv420p` pixels. The light recording is 32.92 seconds; the dark recording is 33.28 seconds. Both pass a full FFmpeg decode. Inspection of two-second frame sequences, full-size frames, and normal-speed playback confirms readable captions, a visible pointer, hover pauses, matching file views, and the retained divider position after each file change.
