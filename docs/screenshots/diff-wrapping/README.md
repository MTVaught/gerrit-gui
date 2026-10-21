# Independent diff wrapping evidence

Tested on Linux with Electron 44.2.0 and the production renderer at 1440 x 960. The existing review fixture supplies simulated Gerrit data, including a complete file with more than 100,000 lines. Pointer actions use X11 input through `xdotool`. Keyboard checks use Electron input events. No live Gerrit server or account is used.

The T3 collaborative browser cannot start on this host because AppArmor blocks its sandbox. These captures use the project's isolated Electron workflow and the `record-actions` skill.

## Results

- Both videos start with equal pane widths, drag the divider left, hold the result, then drag right and hold again. Each narrow pane wraps its text. Each wide pane keeps a short source line on one visual row.
- Matching source rows remain aligned after each drag. Blank space in the wide pane aligns the source rows with wrapped lines in the narrow pane.
- Wheel scrolling keeps matching source lines aligned. Complete-file keyboard navigation reaches the final source line with unequal pane widths. An inline comment opened in the narrow modified pane anchors to source line 1 and keeps source line 2 aligned.
- With Fit to screen disabled, the saved column limit stays at 40 during a divider drag. Enabling Fit to screen restores independent wrapping without changing that saved limit. Window resizing also updates viewport wrapping.
- The direct check run measured divider drags at about 1.1 to 1.4 seconds and end-of-file navigation at about 0.1 seconds. The recorded run includes deliberate pointer motion, so its drag measurements are longer. `checks.json` contains the final recorded run's measurements and assertions.
- The uneven 100,000-line fixture creates about 100,000 Monaco alignment zones. Navigation remains usable in the tested case. This fix does not optimize Monaco's zone allocation; files beyond this fixture have not been measured.
- Typecheck, all 348 unit tests, the existing review UI workflow, and the inline-comment scroll workflow pass. Strict validation passed for the change before archive and passes for the synced main spec.

## Artifacts

- `independent-wrap-light.mp4` and `independent-wrap-dark.mp4` show the same divider workflow, data, framing, and scroll position. Captions describe each action, the pointer stays visible, and it pauses before each drag.
- `independent-wrap-light.png` and `independent-wrap-dark.png` show the same final left-narrow split and source position.
- `checks.json` records wrapping, source row alignment, linked scrolling, comment anchoring, saved column mode, window resizing, and complete-file navigation checks.

Both videos decode without errors. They use H.264 with `yuv420p` at 1440 x 960 and last about 21.5 seconds. Frames from the drag and both settled splits were inspected in each theme. The final text, divider, pointer, and captions are visible in both versions.

## Reproduce

```sh
pnpm build
pnpm typecheck
pnpm test
xvfb-run -a -s '-screen 0 1440x960x24 -nolisten tcp' node_modules/.bin/electron --no-sandbox test/review-ui.cjs
xvfb-run -a -s '-screen 0 1440x960x24 -nolisten tcp' node_modules/.bin/electron --no-sandbox test/review-comment-scroll-ui.cjs
REVIEW_WRAP_VIDEO=1 xvfb-run -a -s '-screen 0 1440x960x24 -nolisten tcp' node_modules/.bin/electron --no-sandbox test/review-wrapping-ui.cjs
openspec validate review-diff-layout --type spec --strict
```

The fixture uses a temporary user-data directory and removes it on exit. The recorder and virtual display stop after capture. Windows, macOS, and browser mode were not tested for this change.

## Archive and spec sync

The completed change is archived at `openspec/changes/archive/2026-10-21-fix-independent-diff-wrapping/`. All five artifact files, including `.openspec.yaml`, retain their pre-archive SHA-256 hashes. The new main spec at `openspec/specs/review-diff-layout/spec.md` preserves the delta's purpose, three requirements, and six scenarios verbatim, with canonical main-spec headings. All nine main specs pass strict validation.

`archive-checks.json` records the verified file state. `archive-light.png` and `archive-dark.png` show that state with the same content and framing. The archive report reads the resulting files; its data is not simulated.
