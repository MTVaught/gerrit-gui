# Verification

The Patch set selector filters complete threads by saved patch set. It combines with Show and Author and defaults to All patch sets. Only patch sets represented in comments or drafts appear in the selector.

## Checks

- `npm run typecheck` passed.
- `npm test` passed all 390 tests.
- `npm run build` passed.
- `openspec validate add-comment-patch-set-filter --strict` passed.
- `test/review-comment-overview-ui.cjs` passed the existing light and dark overview checks, including focus, dismissal, scrolling, desktop and narrow layout, and review continuity.
- `test/review-comment-patch-set-ui.cjs` passed in both themes. It checks default selection, numeric option order, published and draft-only patch sets, original patch sets despite mapped locations, full threads across patch sets, all three filters together, empty results, clearing a filter, retained selection, and unchanged file, comparison, code position, drafts, and writes. It checks widths of 1440 and 420 pixels for horizontal overflow.

## Capture

Run after building:

```sh
CAPTURE_PATCH_SET_FILTER=1 xvfb-run -a -s '-screen 0 1440x900x24 -nolisten tcp' node_modules/.bin/electron test/review-comment-patch-set-ui.cjs
```

The capture uses the built Electron renderer on Linux at 1440 by 900 pixels. Gerrit data and API responses come from the in-memory fixture. The recorded actions use native X11 pointer and keyboard input through xdotool. Captions identify the Home, arrow, and Enter keys used to select native dropdown options. The pointer moves to each control and pauses for two seconds before each click.

The paired screenshots show PS 2 selected with the same two threads and scroll position. The videos show opening All comments, selecting PS 2, combining status and author filters, reading the empty result, restoring all filters, and returning to the review.

Both screenshots and exported video frames were inspected for readable controls, thread content, captions, pointer position, empty results, and return to the review. Both videos decode without errors. They use H.264, yuv420p, 1440 by 900 pixels, and 20 frames per second. The light video is 59.3 seconds; the dark video is 59.5 seconds. The native filter assertions passed during both recordings.

- [Light screenshot](evidence/patch-set-filter-light.png)
- [Dark screenshot](evidence/patch-set-filter-dark.png)
- [Light video](evidence/patch-set-filter-light.mp4)
- [Dark video](evidence/patch-set-filter-dark.mp4)
- [UI check results](evidence/checks.json)
- [Video metadata](evidence/media.json)

Windows, macOS, and a live Gerrit server were not tested.

## Archive and spec sync

The two delta requirements are present in the main review-comment-overview spec. All eight earlier requirements and the Purpose remain unchanged. All 16 main specs passed validation. All three tasks are complete, and the change is absent from the active change list. The archive retains every original evidence file without changes. The capture script now writes to this archive's evidence directory.

- [Archive checks](evidence/archive-result.json)
- [Light archive result](evidence/archive-light.png)
- [Dark archive result](evidence/archive-dark.png)
