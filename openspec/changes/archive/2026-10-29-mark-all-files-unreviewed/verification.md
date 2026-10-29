# Verification

## Archive

On 2026-10-29, the four delta requirements and 12 scenarios were synced into `openspec/specs/review-file-navigation/spec.md`. The existing title, purpose, and three requirements were preserved. The main spec now has seven requirements and 18 scenarios, and passes strict validation. All 16 main specs pass validation.

The completed spec-driven change was moved to `openspec/changes/archive/2026-10-29-mark-all-files-unreviewed/`. All four artifacts and eight tasks were complete. File hashes confirmed that all 24 existing files, including `.openspec.yaml` and visual evidence, survived the move unchanged. The change no longer appears in the active-change list. The capture runners now write to the archive's evidence directory and pass syntax checks.

The paired [light](evidence/archive-light.png) and [dark](evidence/archive-dark.png) reports were captured and inspected after the archive. They record this archive and sync operation.

## Result

The branch was rebased onto `origin/main` at `df5797c`. All eight tasks for `mark-all-files-unreviewed` are complete. The file list now has a compact 22 px crossed-out checkmark button in the Files heading, beside the reviewed count. Its accessible name and tooltip are "Mark all unreviewed".

The implementation uses the `ReviewedFilesState` added by the latest main branch. It clears the full reviewed-path snapshot sequentially, accepts only confirmed deletes, and holds its guard through the final status read. A failure stops the loop and keeps confirmed progress. Retry uses current server status. The current file visit remains unreviewed when automatic marking is enabled.

## Checks

- `pnpm test` passed all 389 tests, including 15 reviewed-state tests.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `openspec validate mark-all-files-unreviewed --strict` passed.
- `git diff --check` passed.
- `test/reset-reviewed-files-ui.cjs` passed against the built desktop and production service and preload. Input used Chromium mouse and keyboard events. The test covers hidden and outside-comparison paths, commit-message flags, duplicate reset, reviewed shortcuts, pending closure, partial failure, status retry, automatic marking and later visits, Enter and Space activation, and embedded reviews.
- The desktop test also checks persistence after reopening, updates in another review window, retained selected files and draft text, unchanged published comments and base patch-set flags, and a 22 px glyph that stays inside the 140 px pane minimum in both themes. The count can wrap at the minimum width.
- The existing `test/reviewed-files-ui.cjs` regression test passed. Rapid individual marks still save independently, keep optimistic updates, preserve other flags during refresh, protect closure, and recover from failed writes or reads.
- Unit tests cover blocked writes and a connection change during deletes or final status reconciliation. No late response can populate a different review context.

## Visual evidence

The final glyph is option 3, the crossed-out checkmark. Matching [light](evidence/reset-heading-light.png) and [dark](evidence/reset-heading-dark.png) screenshots show it enabled in the actual file pane with the same data and scroll position. The built Electron UI test was run again after this glyph change. The workflow recordings below show the earlier circular glyph; the action and behavior are the same.

Capture used the record-actions skill on Linux X11 with Electron 44.9.3. Both videos use the same 1920 by 1080 desktop, five files, three initial reviewed flags, framing, actions, captions, and pacing. The pointer moves to each target and waits two seconds before clicking. Each continuous clip shows the starting flags, the Unreviewed only filter, the reset, zero reviewed files, and the saved flags after closing and reopening.

- [Light video](evidence/mark-all-unreviewed-light.mp4).
- [Dark video](evidence/mark-all-unreviewed-dark.mp4).
- [Light result](evidence/reset-result-light.png) and [dark result](evidence/reset-result-dark.png).
- [Light minimum-width pane](evidence/reset-narrow-light.png) and [dark minimum-width pane](evidence/reset-narrow-dark.png).
- [Light server observations](evidence/reset-observations-light.json) and [dark server observations](evidence/reset-observations-dark.json).

Both MP4 files decode successfully as H.264 with yuv420p pixels. Their frames, captions, hover pauses, transitions, results, and paired static views were inspected. The recordings show three DELETE requests for the three initial reviewed paths and no reviewed flags after reopening.

Gerrit data, 650 ms write delays, 400 ms status-read delays, and test failures were simulated by a loopback fixture. UI input, review navigation, rendering, writes through the production service, and native window closing were real. This does not establish behavior against a live Gerrit deployment or native Windows and macOS.

## Capture setup

T3 preview returned "This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+)." Capture used the repository's isolated Xvfb and D-Bus desktop workflow instead. Electron's package sandbox helper needed the root ownership and mode documented by `scripts/ensure-electron.mjs`; those package-file permissions were restored after testing. No host protection was disabled. Temporary recorders, app instances, displays, window managers, and fixture servers were stopped.

The repeatable runners are `test/reset-reviewed-files-ui.cjs` and `test/record-reset-reviewed-files.cjs`. Run them after `pnpm build` in an isolated D-Bus session under Xvfb. For recording, use a 1920 by 1080 display and set `RESET_REVIEWED_THEME` to `light` or `dark`. The recording runner uses Openbox, xdotool, and FFmpeg.
