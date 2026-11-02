# Shift+A verification

Tested the built Electron renderer on Linux with an isolated Xvfb desktop. Gerrit data and the preload API are simulated by `test/fixtures/local-review-preload.cjs`. The review components, shortcut handling, and Monaco editor are the production build. This does not establish Windows or macOS behavior.

The same workflow runs in embedded and separate review windows, in light and dark modes. Real X11 keyboard input hides the original pane, opens another file, and restores the original pane at the saved 0.37 divider ratio. Checks also cover focus transfer, full modified width, readable source rows, window resizing, search input protection, explicit original navigation, unified mode, and shortcut help. The source fixtures contain about 100,000 lines.

## Artifacts

- `shift-a-light.mp4` and `shift-a-dark.mp4` show the matching separate-window workflow. Both contain captions, a visible pointer, and a two-second hover before the file click.
- `hidden-light.png` and `hidden-dark.png` show the same hidden-pane state, file, and scroll position.
- `restored-light.png` and `restored-dark.png` show the same restored state after switching files.
- `checks.json` records the four successful UI runs and measured widths.
- `media.json` records FFprobe metadata for the exported H.264 videos.

Inspected both exported videos through sampled frames across the full sequence, plus the full-size hidden and restored images. Both modes show readable code and captions. The hidden original no longer creates blank rows by wrapping at zero width.

Archive verification is recorded in `archive-result.json` and `archive-report.html`. The paired `archive-light.png` and `archive-dark.png` images show the verified archive and preserved feature evidence. The delta requirements are synced to the main `review-diff-layout` spec.

## Reproduce

Run from the repository root:

```sh
pnpm typecheck
pnpm test
pnpm build
REVIEW_PANE_VIDEO=1 xvfb-run -a -s '-screen 0 1440x960x24 -nolisten tcp' node_modules/.bin/electron --no-sandbox test/review-pane-ui.cjs
openspec validate review-diff-layout --type spec --strict
```

All 390 unit tests, type checks, the build, four UI runs, and strict OpenSpec validation passed. Temporary windows, recording processes, and the Xvfb display stopped at test completion. No external Gerrit writes occurred.

The pane adapter uses the private sash calculation in pinned Monaco 0.57.0. Run this UI check when upgrading Monaco.
