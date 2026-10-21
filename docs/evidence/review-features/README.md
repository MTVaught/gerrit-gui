# Combined review feature verification

All seven adopted requests are implemented together. Each has a proposal, design, spec delta, completed tasks, a synced main spec, and an archive under `openspec/changes/archive/2026-10-21-<change>/`. Each feature was committed after archive. All seven feature commits are ancestors of this branch.

## Feature records and fresh evidence

These captures use the combined application, after all seven source branches were merged.

| Request | OpenSpec change | Feature commit | Tasks | Light evidence | Dark evidence |
| --- | --- | --- | --- | --- | --- |
| Remove replacement authoring controls | `remove-comment-suggested-replacement` | `344ac74` | 2/2 | [Screenshot](range-comment-editor-light.png) | [Screenshot](range-comment-editor-dark.png) |
| Render collapsed Markdown | `render-collapsed-comment-markdown` | `27a7f06` | 2/2 | [Screenshot](collapsed-markdown-light.png) | [Screenshot](collapsed-markdown-dark.png) |
| Anchor before a selected trailing newline | `fix-comment-trailing-newline-anchor` | `ca66fc2` | 7/7 | [Video](fixed-newline-selection-light.mp4) | [Video](fixed-newline-selection-dark.mp4) |
| Scroll long comment fields | `enable-comment-field-scrolling` | `c7b927d` | 7/7 | [Video](comment-scroll-light.mp4) | [Video](comment-scroll-dark.mp4) |
| Cancel a comment with Escape | `cancel-comment-on-escape` | `5f90aa9` | 3/3 | [Video](comment-escape-light.mp4) | [Video](comment-escape-dark.mp4) |
| Enter for newline, modifier Enter for save | `comment-editor-enter-shortcuts` | `58a20da` | 4/4 | [Video](comment-keys-light.mp4) | [Video](comment-keys-dark.mp4) |
| Ignore whitespace across Gerrit chunks | `fix-review-whitespace-chunks` | `29a8a85` | 5/5 | [Video](loop-indent-light.mp4) | [Video](loop-indent-dark.mp4) |

The source threads are `9dcc4326-ca2d-40b4-934b-863ea222296c`, `c18c8ada-4259-4374-85bf-dba96b6b0189`, `e35c4321-d284-4717-a5c4-d7fac1835b4e`, `e1367ab4-7ca0-42f1-a57e-30572d65ba25`, `d0fcf08f-45b9-4518-a458-4b37d3a76b2e`, `d0958c95-b35f-426e-9f51-91750d34c6fb`, and `810e218a-e938-4bd0-9e48-b517cb65e765`, in table order.

## Verification

- All 359 unit tests passed, with no skipped tests. Typecheck and the production build passed.
- Strict OpenSpec validation passed for all 14 main specs and the existing active dashboard-tooltip change. All 30 tasks for the seven adopted changes are complete.
- `test/review-comments-ui.cjs` passed the full comment workflow, overview checks in both themes, stored suggestion preservation, preview and apply, publication, and the selection checks.
- `test/review-collapsed-markdown-ui.cjs` passed both comment views and themes, expansion, link state, headings, lists, fenced code, and hard breaks.
- `test/review-comment-scroll-ui.cjs` passed in both themes. It covers both panes, unified layout, field boundaries, unfocused wheel input, native resize and scrollbar drag, draft operations, stored suggestion preservation, and fallback dialog scrolling. Scrolling sends no source request or draft write.
- `test/review-comment-escape-ui.cjs` passed in both themes, including pending writes, failure and retry, new drafts, saved draft restoration, and review dismissal outside a composer.
- `test/review-comment-keyboard-ui.cjs` passed both themes. Enter and Shift+Enter insert newlines. Ctrl+Enter saves and closes. It also checks replies, edits, fallback composition, autosave, failures, Meta+Enter, and the input-composition guard.
- `test/review-whitespace-ui.cjs` passed all four whitespace modes in both themes. The loop and braces and a real value edit stay highlighted. The tab-indented body loses its highlight under All and Leading and trailing. Preference changes reuse the source request.
- `test/review-ported-reply-ui.cjs` and `test/review-rebase-ui.cjs` passed anchor, lifecycle, publication-scope, rebase-color, unified-view, and source-cache checks.

The selected-newline check covers the shortcut and context menu, forward and reverse selections, both split panes, an older base comparison, unified and wrapped views, autosave, Save, reopening, newline-only input, and preservation of stored ranges.

## Integration decisions

The removal request omits replacement authoring controls. Existing suggestion display, preview, apply, and saved data remain available. Older scrolling, Escape, and selection tests created suggestions through those controls. The combined tests instead seed stored suggestions through the simulated server and verify that message editing, scrolling, Save, and Cancel preserve them. The current composition spec omits references to fields removed by the companion change. Original archived source plans retain their historical scope.

The collapsed Markdown source thread had no OpenSpec change. This adoption created its planning artifacts, ran apply against the existing implementation, synced two requirements and four scenarios into `review-comment-overview`, and archived it before its feature commit.

Capture runners accept `REVIEW_FEATURE_EVIDENCE` so a combined verification can save fresh evidence here without recreating active OpenSpec directories. The archived newline runner also resolves the repository from its archive location.

## Reproduce

Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `openspec validate --all --strict`. Run each Electron check above under an isolated Xvfb display with the built renderer. For example:

```sh
REVIEW_COMMENTS_OUTPUT=docs/evidence/review-features \
  xvfb-run -a -s '-screen 0 1600x1000x24 -nolisten tcp' \
  node_modules/.bin/electron --no-sandbox test/review-comments-ui.cjs

REVIEW_FEATURE_EVIDENCE=docs/evidence/review-features CAPTURE_COMMENT_KEYS=1 \
  xvfb-run -a -s '-screen 0 1440x1000x24 -nolisten tcp' \
  node_modules/.bin/electron --no-sandbox test/review-comment-keyboard-ui.cjs
```

Use `COMMENT_SCROLL_THEME=light` and `dark` for the scrolling checks. Use `ESCAPE_THEME=light` and `dark` for Escape checks; add `RECORD_ESCAPE=1` to record them. Run `test/record-comment-field-scroll.cjs` on a 1280 by 960 display for the scrolling videos. Run the archived `fix-comment-trailing-newline-anchor/evidence/reproduce.cjs` with `REPRO_EXPECT_FIXED=1` for the selection videos. Set `REVIEW_WHITESPACE_VIDEO=1` and `REVIEW_WHITESPACE_OUTPUT=docs/evidence/review-features` for the whitespace videos. Give capture runners `REVIEW_FEATURE_EVIDENCE=docs/evidence/review-features` to use this evidence directory.

## Capture review and limits

Tested on Linux Electron 44.2.0 under Xvfb. Gerrit reads, writes, and source files are simulated. Keyboard and pointer actions run through the real renderer. Recorded input uses xdotool, with a visible pointer, about two seconds of hover before clicks, action captions, and pauses on the results. Both versions were inspected for the same view, data, action sequence, framing, readable text, and final behavior. All ten H.264/yuv420p exports decode without errors; metadata is in [media-validation.json](media-validation.json).

T3 preview could not start because the host blocks its browser sandbox through AppArmor. The repository's documented Electron fixture launcher uses `--no-sandbox` for these isolated tests. No host protection or persistent machine configuration was changed.

The Linux Meta+Enter check and composing-event check use simulated input flags. Native macOS, Windows, physical trackpads, and a live Gerrit service were not tested in this combined verification.
