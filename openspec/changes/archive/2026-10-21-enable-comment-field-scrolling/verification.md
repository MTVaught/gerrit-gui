# Verification

## Result

Comment fields scroll internally with native wheel input. Both code panes stay fixed during text scrolling and at the field boundaries. Once a resized field fits its text, scrolling over it moves the diff. The fallback dialog follows the same rules.

The implementation uses one native wheel listener on the shared composer. It leaves browser scrolling enabled and prevents Monaco from consuming gestures over overflowing textareas. Input and composer resize observations keep overscroll containment current. Listener and observer cleanup follow the form lifetime. No API, dependency, setting, or draft format changed.

## Regression and checks

Before the fix, the new wheel assertion failed because the long comment's scrollTop did not change. Existing selected-line checks passed in modified, original, and unified layouts. After the fix, the full workflow passed in light and dark mode.

- `pnpm build` passed.
- `pnpm test` passed, with 353 tests and no failures.
- `pnpm typecheck` passed.
- `xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/review-comments-ui.cjs` passed, including the existing comment overview checks in both themes.
- `xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/review-comment-scroll-ui.cjs` passed.
- `COMMENT_SCROLL_THEME=dark xvfb-run -a node_modules/electron/dist/electron --no-sandbox test/review-comment-scroll-ui.cjs` passed.
- `openspec validate enable-comment-field-scrolling --strict` and `git diff --check` passed.

The scrolling workflow checks both text boundaries, unfocused hover, unchanged message and dimensions, stable pane positions, no scroll-only draft writes, modified zoom-event routing, keyboard caret movement and selection, native scrollbar drag, native corner resize, short fields, scrolling over controls, reply identity and anchors, editing and Cancel, suggested replacements, and a fallback composer with real dialog overflow. The existing selected-line checks remain intact.

Scroll, text entry, keyboard navigation, scrollbar drag, and resize use Electron input events. Wheel input includes both pixel deltas and wheel ticks, so native textareas and Monaco receive the expected input data. The zoom routing check uses a synthetic DOM event only to verify propagation; it is not proof of physical zoom or trackpad behavior. The unavailable-diff case is simulated through the fixture API.

## Video evidence

Recorded with the [record-actions skill](/home/dev/.codex/skills/record-actions/SKILL.md) on Linux X11, using Electron 44.2.0, Xvfb, xdotool, and FFmpeg. The renderer and its event handling are the real application. Gerrit reads and writes use the in-memory fixture. xdotool automates native pointer, click, and wheel-button input through X11; no DOM handler or scrollTop assignment performs the recorded scroll actions.

- [Light mode](evidence/comment-scroll-light.mp4), about 31 seconds.
- [Dark mode](evidence/comment-scroll-dark.mp4), about 31 seconds.

Both use the same 1280 by 960 framing, file, patch set, 30-line comment, starting code position, field size, and action sequence. Each shows pointer movement and a two-second hover before clicking, internal scrolling to the last line, further scrolling at that boundary, a return to the first line, and normal diff scrolling after the pointer moves over code. Captions sit below the app controls.

Both exported files decode without errors and use H.264 with yuv420p and fast-start metadata. Full-size frames and time-sampled contact sheets were inspected for text readability, pointer visibility, matching geometry, captions, boundary state, and the final diff movement. `evidence/recording-results.json` records the asserted runtime state. `evidence/video-validation.json` records format and duration.

Reproduce the capture with:

```sh
xvfb-run -a -s '-screen 0 1280x960x24 -nolisten tcp' node_modules/electron/dist/electron --no-sandbox test/record-comment-field-scroll.cjs
```

The script creates isolated application data and closes the windows and FFmpeg recorders when complete. Xvfb exits with the launcher. No host configuration was changed.

## Limits

T3 preview open returned: "Preview automation open failed: This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+)." Native Electron under Xvfb supplied the recording and UI checks. The local test launcher uses `--no-sandbox`; the production launch path is unchanged.

No physical trackpad, macOS, Windows, or separate browser runtime was tested. The implementation retains native delta handling, but the automated mouse-wheel evidence does not establish those hardware or platform results.
