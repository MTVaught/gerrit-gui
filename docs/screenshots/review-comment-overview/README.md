# All comments overview

These captures show the implemented All comments dialog in the built Electron application on Linux, using Xvfb at 1600 by 1000 pixels. Gerrit responses, source files, accounts, comments, and drafts come from `test/fixtures/local-review-preload.cjs`. No real Gerrit account is used. The recordings use native pointer and keyboard input through `xdotool`.

The dialog uses 90% of the review window width. Its header, filters, and Back to review button stay visible while threads scroll. The return button, Escape, and a click on the dimmed background each close the overview and keep the review open.

## Captures

| Mode | Layout | Recorded workflow |
| --- | --- | --- |
| Light | [Screenshot](all-comments-light.png) | [Video](all-comments-workflow-light.mp4) |
| Dark | [Screenshot](all-comments-dark.png) | [Video](all-comments-workflow-dark.mp4) |

Each video opens the Comments menu and All comments, scrolls the thread list, closes with Back to review, reopens and presses Escape, then reopens and clicks the background. Captions explain the actions. The pointer moves to each click target and pauses for two seconds before clicking.

Both screenshots use the same fixture data, window size, and list scroll position. Both videos use the same sequence and pacing. The exported H.264 videos include the pointer and captions. Both themes were inspected for readable controls, fixed header placement, visible input actions, and return to the review.

The images in `openspec/changes/archive/2026-10-15-widen-review-comments/previews/` are earlier design previews made with temporary browser styling. The captures here use the implemented renderer and demonstrate its actual behavior. Linux verification does not cover native Windows or macOS behavior.

## Reproduce

Build the application, then run the isolated overview checks:

```sh
pnpm build
xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/.bin/electron --no-sandbox test/review-comment-overview-ui.cjs
```

To replace the paired captures, run the same command with recording enabled. This requires Xvfb, xdotool, FFmpeg, and the DejaVu Sans font installed on the test machine.

```sh
CAPTURE_REVIEW_OVERVIEW=1 xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/.bin/electron --no-sandbox test/review-comment-overview-ui.cjs
```

## Checks

- `pnpm typecheck`: passed.
- `pnpm test`: 243 tests passed.
- `pnpm build`: passed.
- `test/review-comment-overview-ui.cjs`: passed in Electron. Checks both themes at desktop and narrow window sizes, horizontal overflow, modal focus containment, fixed controls during scrolling, all three close actions, clicks on content and padding, drags across the dialog boundary, review state preservation from a scrolled code view, and focus after location navigation.
- `xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/.bin/electron --no-sandbox test/review-comments-ui.cjs`: passed. Includes the overview checks plus publishing, drafts, filtering, cross-file replies, suggested fixes, outline, blame, and metadata updates. The fixture reveals code before typing into offscreen inline fields and waits for visible, focused inputs.
- Paired capture run: passed, with assertions after scrolling and each dismissal. Both recordings decode as H.264 with `yuv420p` and have comparable durations of about 43 seconds.
