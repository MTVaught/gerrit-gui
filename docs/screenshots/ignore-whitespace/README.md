# Ignore whitespace verification

OpenSpec change: [fix-review-whitespace-chunks](../../../openspec/changes/archive/2026-10-21-fix-review-whitespace-chunks/proposal.md). Its delta spec, design, and tasks define the acceptance checks. The recordings were regenerated after the apply audit and a fresh application build.

The fixture wraps four existing statements in a new `for` loop and adds one tab to each statement. A separate edit changes `retryLimit` from 2 to 3. The removed body and the added loop arrive as adjacent Gerrit content chunks.

Before the fix, selecting All still highlighted the full body. The packaged renderer check failed because it found five removed lines and seven added lines. After the fix, only the loop header, closing brace, and value change have highlights. The four statements remain visible with their original source indentation and line numbers.

`reproduction.json` compares the pre-change worker from the recorded Git revision with the fixed worker on the same loop input under IGNORE_ALL. The old worker returns one changed region for the complete body and loop. The fixed worker returns two insertion regions for the loop header and closing brace. Both results are checked with exact range assertions.

The diff worker now compares adjacent changed chunks together when a whitespace filter is active. It keeps unchanged Gerrit lines as boundaries and keeps rebase metadata separate. None retains the server block behavior.

Recordings use real pointer and keyboard input in Linux Electron with simulated Gerrit data. Each starts with None, opens Diff preferences, selects All with the native select control, and closes the dialog. Captions explain the keys. Both modes use the same data, framing, scroll position, and timing.

- Light: [recording](loop-indent-light.mp4), [result](loop-indent-light.png).
- Dark: [recording](loop-indent-dark.mp4), [result](loop-indent-dark.png).

`checks.json` records the highlighted source lines before and after the selection. The UI check also tests Leading and trailing, Trailing, and None, and confirms that preference changes make no extra content requests. Unit tests cover combined and separate content chunks, reversed chunk order, source columns, unchanged anchors, tab-only changes, and the added loop.

Both recordings are about 18 seconds long at 1600 by 1000 and 20 frames per second. `video-checks.json` records their exact duration, H.264 format, and a successful decode of every frame. Frames at two-second intervals and the full-size result images were inspected for readable controls, pointer position, setting selection, and the final highlights.

Validation passed:

- `openspec validate fix-review-whitespace-chunks --strict`.
- `pnpm test`, 354 tests.
- `pnpm typecheck`.
- `pnpm build`.
- `test/review-whitespace-ui.cjs`, both modes and all four whitespace settings.
- `test/review-ui.cjs`, including full-file navigation, preferences, search, caching, and patch set comparison.
- `test/review-rebase-ui.cjs`, including rebase colors, whitespace filtering, and unified view.

`verification.json` records the checks, source hashes, platform, and validation time. The data is synthetic and does not establish the exact chunk structure of the user's private diff.

T3 preview could not open. It reported: "This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+)." Capture used the repository's isolated Electron/Xvfb workflow and the record-actions skill. No host settings were changed. Other operating systems were not tested.

To repeat:

```sh
pnpm build
REVIEW_WHITESPACE_VIDEO=1 xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/.bin/electron --no-sandbox test/review-whitespace-ui.cjs
```

The change was synced and archived on 2026-10-21. `archive-checks.json` records the archive path, preserved artifact hashes, synced requirements and scenarios, and strict validation. [Light archive record](archive-light.png) and [dark archive record](archive-dark.png) show a report read from the saved files, captured in Electron.
