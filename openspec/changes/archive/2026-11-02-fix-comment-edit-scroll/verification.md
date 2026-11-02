# Verification

The completed change was archived on 2026-11-02. Its added requirement and all three scenarios match the main `review-comment-editing` spec. All 16 main specs passed validation after sync. The archive retains all four completed tasks and both theme videos.

Verified on 2026-11-02 with Linux X11, Xvfb, and Electron 44.9.3. The harness loads the built renderer with simulated Gerrit data and isolated user data. Mouse clicks, wheel input, and recorded keyboard input use xdotool. No live Gerrit comments were changed. Native Windows and macOS behavior was not tested.

## Result

The regression check failed against the original renderer. Opening the single revision draft moved its top from 591.390625 to 136.390625 pixels, a 455-pixel jump, and scrolled both code panes.

After the fix, all 12 combinations pass. These cover light and dark mode, side-by-side and unified layouts, revision and base-side single drafts, and a saved reply whose tall thread has its code anchor above the viewport. Maximum measured comment movement is zero pixels. Both pane scroll origins stay unchanged. Text receives focus. Save retains the draft ID, original anchor, and reply relationship. Cancel restores the saved message. Editing does not fetch source files again.

The editor grows downward inside its existing thread. Code after the comment can move as the view zone grows. This height change does not change the diff scroll position.

## Checks

- `npm run build` passed.
- `npm run typecheck` passed.
- `npm test` passed all 390 tests after rebasing onto current main, including its new diff-pane shortcut test.
- `test/review-comment-edit-position-ui.cjs` passed all 12 cases, including Save and Cancel. The final run used `CAPTURE_COMMENT_EDIT=1`.
- `test/review-comment-scroll-ui.cjs` passed new-comment anchoring, field scrolling, native resize, reply editing, suggestion preservation, and fallback composer checks.
- `test/review-ported-reply-ui.cjs` passed stored anchors, inline placement, Save, Cancel, reopening, publish-list editing, and publication checks.
- `test/review-comment-overview-ui.cjs` passed both themes, focus containment, navigation, and review continuity checks.
- `openspec validate fix-comment-edit-scroll --strict` and `git diff --check` passed.

Build first. Run Electron checks with `xvfb-run -a node_modules/.bin/electron`. The new check needs `-s '-screen 0 1440x1060x24'`. The full command is in `docs/testing.md`.

## Visual evidence

- [Light mode video](evidence/comment-edit-light.mp4)
- [Dark mode video](evidence/comment-edit-dark.mp4)
- [Measured edit positions](evidence/edit-position-results.json)

Both videos show the same single-draft Edit, type, and Save sequence at the same starting position. They include the pointer, two-second hover pauses before clicks, and captions. Each video is 13.72 seconds at 1440 by 1060 pixels, with H.264 video and yuv420p pixels.

Inspected full-size editor frames and the sequence at one-second intervals in both themes. The comment stays fixed, text and controls remain readable, the field receives focus, typed text appears, and Save returns to the same draft position. FFmpeg decoded both complete files without errors. Temporary app windows, recorders, and Xvfb sessions exited after capture.
