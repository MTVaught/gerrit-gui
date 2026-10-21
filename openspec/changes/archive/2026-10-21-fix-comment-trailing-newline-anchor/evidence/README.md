# Trailing-newline comment reproduction

Tested on Linux with Electron 44.2.0 and the unchanged built renderer. The Gerrit API and source files are simulated by `test/fixtures/local-review-preload.cjs`. Mouse clicks, selection keys, comment creation, and typing use native X11 input through xdotool. No live Gerrit writes occur.

## Evidence plan

Use the existing 100,000-line review fixture and an isolated Electron profile. In each theme, open the same file at the top, select line 1 without its newline as a control, open and cancel a comment, then select line 1 with its newline and add a comment. Hold on the wrong position, type a draft, and inspect the simulated save payload. Record the whole sequence with the pointer, two-second hovers before clicks, and captions before keyboard actions. Capture matching composer and autosaved states. Inspect both themes before sharing.

## Reproduce

From the project root, build and run the diagnostic:

```sh
pnpm build
xvfb-run -a -s '-screen 0 1440x960x24' \
  node_modules/.bin/electron --no-sandbox \
  openspec/changes/fix-comment-trailing-newline-anchor/evidence/reproduce.cjs
```

Requires Xvfb, xdotool, and FFmpeg. The sandbox flag is limited to this isolated test harness and follows the repository's existing capture workflow. Without an extra flag, the diagnostic expects the original bug. Set `REPRO_EXPECT_FIXED=1` to verify the corrected result and save artifacts with a `fixed-` prefix. The original captures are retained.

## Observed result

- Control uses Ctrl+Home and Shift+End, then C. Copied text is `// Comparing base to patch set 3`, with no line break. The inline region is `Modified comments after line 1`.
- Reproduction uses Ctrl+Home and Shift+Down, then C. Copied text is the same line with a final newline. The inline region is `Modified comments after line 2`.
- Typing triggers the normal composer autosave. The stored draft has `line: 2` and range `{start_line: 1, start_character: 0, end_line: 2, end_character: 0}`. No text from line 2 was selected.
- Both captures use the same file, comparison, size, and scroll position. The videos show the control and faulty workflow; screenshots show the empty composer and autosaved result. JSON files contain the copied selections, region labels, and saved draft.

## Artifacts

- `newline-selection-light.mp4` and `newline-selection-dark.mp4`: continuous input sequence with captions and visible pointer.
- `newline-composer-light.png` and `newline-composer-dark.png`: new composer below the wrong line.
- `newline-saved-light.png` and `newline-saved-dark.png`: text entered and autosaved at the wrong location.
- `reproduction-light.json` and `reproduction-dark.json`: input and saved-coordinate checks.
- `reproduce.cjs`: diagnostic source, without changes to application code.

## Limits

The shared preview browser could not start. Its error was `This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).` Capture therefore uses the documented native Electron workflow. The production review renderer is exercised with fixture responses; the production main-process transport, live Gerrit persistence, and native macOS/Windows behavior are not tested. This is evidence of the current bug, not proof of the proposed fix.

## Capture review

Both theme screenshots and sampled recording frames were inspected. The selection, line numbers, composer, save status, captions, and pointer are visible. The code remains at the top in both versions. Both recordings are H.264 at 1440 by 960 with yuv420p pixels. The light recording is 39.1 seconds and dark is 28.05 seconds; the light run has a longer clipboard-read wait during selection. Both use the same actions and deliberate hover/result pauses. JSON checks confirm identical control, selected text, faulty region, and saved coordinates apart from save timestamps.

## Fixed result

The same native-input workflow now opens the composer directly below line 1, with and without its trailing newline. Autosave stores `line: 1` and range `{start_line: 1, start_character: 0, end_line: 1, end_character: 32}`. The selected text still includes its original newline, so the input is the same as the original reproduction.

Run the fixed capture after building:

```sh
REPRO_EXPECT_FIXED=1 xvfb-run -a -s '-screen 0 1440x960x24' \
  node_modules/.bin/electron --no-sandbox \
  openspec/changes/fix-comment-trailing-newline-anchor/evidence/reproduce.cjs
```

The `fixed-newline-selection-light.mp4` and `fixed-newline-selection-dark.mp4` recordings show the control, selection with a newline, composer, and autosave. Matched `fixed-newline-composer` and `fixed-newline-saved` PNGs show the resulting placement. The `fixed-reproduction` JSON pair records the input and saved coordinates. The same fixture and platform limits apply.

The fixed screenshots and sampled recording frames were inspected in both themes. The composer is between source lines 1 and 2, and the autosave status is visible. Captions and the pointer are visible in the recordings. Both JSON reports have matching selected text and saved coordinates apart from save timestamps. The fixed recordings use H.264, yuv420p, and 1440 by 960 frames.

## Implementation checks

`pnpm test` passed all 355 tests. Type checking and the production build passed. The focused selection, full comment, and ported-reply UI workflows passed on Linux with simulated Gerrit responses. `verification.json` records the final capture formats, durations, saved coordinates, and check results. The fixed recordings were exported again with captions that explain the clipboard check, and both final exports were inspected.
