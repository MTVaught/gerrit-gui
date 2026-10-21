# Verification

Tested on Linux with the built Electron app and simulated Gerrit data. The selected range and comment text use native keyboard input. The existing integration runner also uses DOM actions for other controls and fixture API calls to seed an older draft with a suggestion.

## Results

- `pnpm typecheck` passed.
- `pnpm build` passed.
- `node --test src/renderer/src/review-comments.test.ts src/renderer/src/review-details.test.ts` passed all 10 tests.
- `REVIEW_COMMENTS_OUTPUT=/tmp/remove-comment-suggested-replacement-ui xvfb-run -a -s '-screen 0 1600x1000x24' node_modules/.bin/electron --no-sandbox test/review-comments-ui.cjs` passed all checks.
- `openspec validate remove-comment-suggested-replacement --strict` passed.
- `git diff --check` passed.

The UI checks confirm that new range comments have no suggestion controls or replacement payload. Existing suggestions survive text and resolution autosave, Save, and Cancel with the same ID and range. Publication, suggestion preview and apply, replies, and cross-file navigation pass.

## Visual evidence

- [Light mode](evidence/range-comment-editor-light.png)
- [Dark mode](evidence/range-comment-editor-dark.png)

Both screenshots show the same selected revision range, comment, viewport, and scroll position after autosave. Both were inspected. The complete editor is visible and readable, with formatting preview, Resolved, Save, Cancel, and saved status. Replacement controls are absent.
