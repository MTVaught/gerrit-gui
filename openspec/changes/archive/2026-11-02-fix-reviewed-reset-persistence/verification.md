# Verification

## Result

The client saves `/GERRIT_GUI_UNREVIEWED` before each unreview DELETE and removes that exact marker from reviewed-file results. Clearing the last file no longer lets Gerrit copy flags from an older patch set. The selected patch set remains empty after status refresh and reopening. Older patch sets and another user's flags remain unchanged.

The fix and its tests were completed before this OpenSpec record was created, as requested in the follow-up. Apply checked the existing implementation against all four tracked tasks and their requirements.

## Checks

- `npm test` passed all 392 tests with no skips.
- `npm run typecheck` passed both TypeScript projects.
- `npm run build` passed the production main, preload, and renderer builds.
- `node --test src/main/review.test.ts` passed all nine tests when checked again during apply. The new stateful test failed before the fix because the cleared paths returned. It now covers a fresh client, old patch-set preservation, normal marking, and the last individual clear. A separate failure test confirms that a refused marker PUT prevents the DELETE.
- `test/reset-reviewed-files-ui.cjs` passed against the built desktop, production service, and preload with a simulated loopback Gerrit. It covers filtering, hidden and outside-comparison paths, pseudo-files, pending controls and closure, updates between windows, retained draft text, failures and retry, automatic marking, keyboard activation, and embedded review.
- `test/reviewed-files-ui.cjs` passed with rapid independent input, duplicate-write prevention, error recovery, stable status, updates between windows, and patch-set isolation.
- Syntax checks passed for the real-Gerrit harness and all four updated desktop check and recording runners.
- `openspec validate fix-reviewed-reset-persistence --strict` passed before sync and archive.
- `git diff --check` passed.

## Real Gerrit acceptance and visual evidence

`test/reset-reviewed-files-gerrit.cjs` passed with real Gerrit 3.11.2, generated changes, and dummy Alice and Bob accounts. A temporary Docker instance bound to loopback supplied real REST responses. The production Linux Electron app received real X11 pointer input through xdotool.

For each theme, the test marked two unchanged files reviewed on patch set 2, created patch set 3, and read the inherited flags. Direct DELETE calls without the fix made both paths return on the next read. The fixed desktop reset then cleared them permanently while leaving patch set 2 and Alice's patch-set-3 flag unchanged.

The same sequence was recorded in light and dark mode at 1440 by 1080 with matched framing, file contents, initial flags, and pacing. Each clip shows the reviewed flags, Unreviewed only filter, reset glyph, zero reviewed count, and the saved state after closing and reopening. The pointer moves to each target and waits two seconds before clicking. Static captions were added to the continuous recordings after capture to avoid FFmpeg live-text corruption.

- [Light video](../../../../docs/evidence/reset-reviewed-persistence/reset-persistence-light.mp4).
- [Dark video](../../../../docs/evidence/reset-reviewed-persistence/reset-persistence-dark.mp4).
- [Light observations](../../../../docs/evidence/reset-reviewed-persistence/reset-persistence-light.json).
- [Dark observations](../../../../docs/evidence/reset-reviewed-persistence/reset-persistence-dark.json).

Both final videos were inspected across the workflow and decoded without errors. They are 23.55 seconds long, with H.264 video and yuv420p pixels. Observations record one initial marker PUT, a file DELETE, an idempotent marker PUT, and a second file DELETE, all on the selected patch set. Only the internal marker remains in raw server state.

This verifies Linux Electron with Gerrit 3.11.2. It does not establish native Windows or macOS behavior or compatibility with other Gerrit versions. Raw REST consumers can see the marker. The temporary app, recorders, displays, and Gerrit instance were stopped.

## Spec sync and archive

On 2026-11-02, all three added requirements and six scenarios were synced to `openspec/specs/reviewed-files/spec.md`. Its title, purpose, and four existing requirements were preserved. The delta content matches the main spec, which now has seven requirements. All 16 main specs passed strict validation.

All four planning artifacts and all four tracked tasks were complete before archive. The change was moved to `openspec/changes/archive/2026-11-02-fix-reviewed-reset-persistence/`. Hash checks confirmed that all six change files, including `.openspec.yaml`, survived the move unchanged. This archive note was added after that check. The change no longer appears in the active list. The pre-existing `add-dashboard-icon-tooltips` change was left unchanged.
