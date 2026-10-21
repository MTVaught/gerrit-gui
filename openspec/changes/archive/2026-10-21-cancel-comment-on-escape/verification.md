# Verification

## Result

Escape inside the shared comment form uses the Cancel action and prevents the native dialog from closing the review. A new draft is removed. Editing an existing draft restores its prior content and coordinates. Pending writes consume Escape without closing either editor.

## Automated checks

- `pnpm build` passed.
- `pnpm typecheck` passed.
- `pnpm test` passed, 353 tests.
- `openspec validate cancel-comment-on-escape --strict` passed.
- Focused Electron checks passed in light and dark mode:

```sh
ESCAPE_THEME=light dbus-run-session -- xvfb-run -a -s '-screen 0 1440x960x24' node_modules/.bin/electron test/review-comment-escape-ui.cjs
ESCAPE_THEME=dark dbus-run-session -- xvfb-run -a -s '-screen 0 1440x960x24' node_modules/.bin/electron test/review-comment-escape-ui.cjs
```

The checks use real mouse and keyboard input. They cover empty inline composition, cancellation before autosave, a held autosave, an autosaved reply, a file comment in its fallback dialog, a saved range draft with a suggested replacement, draft restoration, failed restoration and retry, Ctrl+Enter and Ctrl+S saves, preservation of file and comparison, and Escape dismissal outside a composer.

## Environment

Tested on Linux with the built Electron renderer under Xvfb. The existing preload fixture simulates Gerrit data and draft writes. The main process holds one simulated draft write to verify Escape while a request is pending. No live Gerrit account was used. Windows and macOS were not tested.

The collaborative browser could not start because AppArmor blocks its sandbox on this host. The project Electron fixture ran with its setuid sandbox helper configured as described by `scripts/ensure-electron.mjs`.

## Visual evidence

- [Light mode](evidence/comment-escape-light.mp4)
- [Dark mode](evidence/comment-escape-dark.mp4)

Both videos use the same fixture, file, patch set, starting view, framing, and action sequence. Each shows a real pointer move and two-second hover before clicks, typing a reply, autosave, a caption before Escape, and the cancelled composer with the review still open. The draft count returns to zero. The capture checks also confirm that the published parent comment remains present and the file and comparison do not change.

The exported videos are 16.6 seconds each, 1440 by 960, H.264 with yuv420p. Both decode fully without errors. Inspected the sequence frames and full-size frames before and after Escape in both modes. Captions and draft status are readable, the pointer is visible, and the final state stays on screen for over four seconds.

To repeat a capture, add `RECORD_ESCAPE=1` to the focused check command for that theme. Capture results are in `evidence/capture-light.json` and `evidence/capture-dark.json`.
