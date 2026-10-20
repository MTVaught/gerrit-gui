# Review file pane evidence

Tested on Linux with Electron 44.2.0 and the production renderer build at 1440 x 960. Gerrit data comes from `test/fixtures/local-review-preload.cjs`. No live server or account is used. Mouse actions use X11 input through `xdotool`; keyboard checks use Electron input events. The T3 browser could not start because the host blocks its sandbox with AppArmor. These captures use the project's isolated Electron fixture workflow.

## Results

- Automatic width is 494.4 px in both themes. The long file name, folder path, status, and line counts fit on one line.
- At a manual width of 240 px, folder paths and file names wrap in full. Review controls and line counts remain visible.
- Pointer and keyboard resizing work above the former 360 px limit. At a window width of 1440 px, the maximum pane width is 720 px. At a window width of 800 px, the maximum is 400 px.
- Filters update automatic width. An unbroken 179-character file name wraps. Reopening a review restores automatic width. File selection opens the requested diff.
- Both screenshot pairs use the same fixture data, selected file, viewport, and scroll position. The videos show the same sequence and timing in both themes. Captions identify each action; the pointer pauses before clicks and drags.
- Inspected both screenshot pairs and sampled video frames across both complete sequences. Both MP4 files decode without errors and use H.264 with `yuv420p` at 1440 x 960, about 25 seconds each.

## Artifacts

| Result | Light | Dark |
| --- | --- | --- |
| Automatic pane width | [Screenshot](automatic-light.png) | [Screenshot](automatic-dark.png) |
| Full labels at a smaller width | [Screenshot](wrapped-light.png) | [Screenshot](wrapped-dark.png) |
| Resize and open a file | [Video](resize-light.mp4) | [Video](resize-dark.mp4) |
| Verified archive and synced main spec | [Screenshot](archive-light.png) | [Screenshot](archive-dark.png) |

`checks.json` contains the measured pane widths and check results.

The archive screenshots show a report read from the local archive and main spec files after archive. All five artifact files were preserved, including `.openspec.yaml`. The main spec contains the same three requirements and six scenarios as the delta, with its purpose preserved verbatim. Strict validation passed for all seven main specs. The archive is `openspec/changes/archive/2026-10-20-auto-size-review-file-pane/`.

## Reproduce

```sh
pnpm typecheck
pnpm build
pnpm test
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-ui.cjs
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-file-activity-ui.cjs
REVIEW_WIDTH_VIDEO=1 xvfb-run -a -s '-screen 0 1440x960x24 -nolisten tcp' node_modules/.bin/electron --no-sandbox test/review-file-width-ui.cjs
openspec validate review-file-navigation --type spec --strict
```

All commands passed. The unit suite has 340 passing tests. The fixture launcher uses an isolated temporary user-data directory and removes it on exit. The video recorder and virtual display stop when capture ends. The file-activity check also writes its existing screenshots under `docs/screenshots/local-review`; those regenerated files are outside this evidence set.

Windows, macOS, and browser mode were not run for this change.
