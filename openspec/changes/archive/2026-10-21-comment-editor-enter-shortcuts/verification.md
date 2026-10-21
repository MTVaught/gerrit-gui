# Verification

## Behavior

The inline zone now stops keyboard events after the comment portal receives them. Native text input keeps its default action. The shared form ignores save shortcuts during input composition. Shortcut help lists Enter and Shift+Enter for a new line.

The baseline Linux fixture already passed newline input and ordinary save shortcuts. It failed the simulated composition check because Ctrl+Enter saved and closed the editor while composition was active. The focused regression passes after the change in light and dark mode.

## Checks

- `pnpm build` and `pnpm typecheck` passed.
- `node --test src/renderer/src/review-comments.test.ts src/renderer/src/review-shortcuts.test.ts` passed all nine tests.
- `xvfb-run -a -s '-screen 0 1440x1000x24 -nolisten tcp' node_modules/.bin/electron test/review-comment-keyboard-ui.cjs` passed both themes. It covers Enter, Shift+Enter, Ctrl+Enter, Meta+Enter, reply creation, saved draft edits, new comments, fallback composition, autosave, empty input, failed save and retry, and the composition guard.
- `xvfb-run -a node_modules/.bin/electron test/review-comments-ui.cjs` passed the existing comment workflow and overview checks.
- `xvfb-run -a node_modules/.bin/electron test/review-comment-scroll-ui.cjs` passed position checks in modified, original, and unified views.
- `xvfb-run -a node_modules/.bin/electron test/review-ported-reply-ui.cjs` passed reply anchors, lifecycle, reopen, and publication-scope checks.
- `openspec validate comment-editor-enter-shortcuts --strict` passed.

## Capture method and limits

The recordings use the record-actions skill with Xvfb and FFmpeg on Linux Electron. Mouse movement, clicks, Enter, Shift+Enter, and Ctrl+Enter use X11 input through xdotool. The real renderer, Monaco view zones, React composer, and save code run against the existing in-memory Gerrit preload. Gerrit data and responses are simulated; no live Gerrit comments are changed.

The Meta+Enter check uses Electron input events on Linux. The composition flag uses a simulated DOM keyboard event. These checks do not establish native macOS, Windows, or input-method behavior.

T3 preview returned `Preview automation open failed: This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).` The project Electron fixture workflow provided the capture environment. Electron used its supported setuid sandbox helper.

## Evidence

Both exports are 26.44-second H.264 videos at 1440 by 1000 pixels with yuv420p output. Full decoding completed without errors. Frame review confirmed readable captions, visible pointer targets, comparable framing and timing, multiline input, and both save-and-close results in each theme.

- [Light mode](evidence/comment-keys-light.mp4)
- [Dark mode](evidence/comment-keys-dark.mp4)
- Saved payloads in `evidence/saved-draft-light.json` and `evidence/saved-draft-dark.json` confirm the same draft ID, original reply ID, and all three lines after editing.

To repeat the recordings, run:

```sh
CAPTURE_COMMENT_KEYS=1 xvfb-run -a -s '-screen 0 1440x1000x24 -nolisten tcp' node_modules/.bin/electron test/review-comment-keyboard-ui.cjs
```
