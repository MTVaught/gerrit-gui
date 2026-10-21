# Design

## Context

See `proposal.md` for the problem. The relevant path is:

1. `ReviewEditor.tsx` converts a Monaco selection to `EditorCommentLocation` in two places, the `review.addComment` context action and `addComment`, which serves the review shortcut.
2. Both conversions use `selection.endLineNumber` and copy `endColumn - 1` into the Gerrit range. An exclusive endpoint at the start of the following line becomes that following line's anchor.
3. `LocalReview.tsx` passes these coordinates through `commentAnchor`. It uses the line to place the inline host and to reveal and highlight comments.
4. `ReviewComments.tsx` sends the same coordinates in `DraftCommentInput`. It also uses the comment range when creating a suggested replacement.

The [Gerrit REST contract](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#comment-input) ignores `CommentInput.line` in favor of `range.end_line`. The [range contract](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#comment-range) defines an exclusive endpoint. Changing only the rendered line or the `line` payload field would leave the saved anchor wrong.

The editor models contain the original source. Whitespace normalization only affects diff calculation. This makes model line lengths the correct source for adjusted endpoints.

`review-diff-layout` already requires stable inline anchors during wrapping. `review-comment-replies` requires replies to retain the parent's stored anchor. Neither defines conversion of a fresh selection; the new capability owns that behavior.

## Goals / Non-Goals

Goals:

- Resolve the exclusive endpoint once, before the new composer and storage payload diverge.
- Use a small, independently testable conversion that reads at most one source-line length.
- Keep source coordinates correct in both panes and layouts.

Non-goals:

- Rewriting server comments, old drafts, replies, mapped positions, or suggested-fix replacement ranges.
- Changing Monaco selection behavior, keyboard bindings, gutter actions, or diff whitespace settings.
- Fixing the unrelated shared-browser sandbox configuration on this host.

## Decisions

### Normalize only fresh selections at comment creation

Add a pure helper to `review-comments.ts`. It accepts the ordered selection bounds and a source-line-length reader and returns `{ line, range? }`. Use structural types so unit tests do not load Monaco. Keep pane selection and patch-set/path mapping in their existing callers.

Use this algorithm:

1. For an empty selection, return the caret line without a range.
2. For a nonempty selection where `endColumn === 1` and `endLineNumber > startLineNumber`, move the endpoint back exactly one source line. Set its Gerrit `end_character` to that source line's length. Preserve the start position.
3. If the adjusted bounds are equal, return a line comment on the adjusted end line without a range. This covers newline-only and empty-line selections.
4. Otherwise, return the source range with zero-based character offsets and set `line` to its end line.
5. Selections ending elsewhere retain their coordinates.

Use ordered selection bounds, rather than the active cursor position, so reverse selections work. Read line length from the editor model, not the visible DOM, normalized diff, expanded tabs, or wrapped rows. CRLF terminators are excluded by the model's line length. Preserve the editor's character-coordinate convention for Unicode.

Do not trim whitespace or skip blank lines. Only the final boundary line break is excluded. A selection of several lines that includes a final blank line still anchors to that blank line. A final empty model line after a file-ending newline follows the same rule.

### Route both entry points through the helper

The context action uses its own code editor's selection and model, with its known pane. `addComment` uses the focused editor and the same conversion. Keep `commentAnchor`, the service, and inline-host placement unchanged; they consume the corrected result.

A display-only correction would preserve the exact selected newline, but Gerrit would still save the following end line. Normalizing every stored anchor would risk breaking historical replies and replacement ranges. Normalizing only `line` would be overwritten by Gerrit. The creation boundary avoids all three problems.

### Make the replacement-range choice explicit

A new comment excludes the final newline from its anchor. A newly created suggested replacement derived from this anchor therefore excludes that newline too. A new suggestion replaces the selected text while leaving the source line break in place. Existing or server-supplied replacement ranges remain untouched. A newline-only selection becomes a line comment and does not offer a range-based replacement.

### Verify the visible position and saved coordinates

The reproduction uses the built Linux Electron renderer, its production review components, the existing simulated Gerrit preload, and native xdotool input. A control selection without the newline must place the composer after line 1. Selecting the same line with its newline must reproduce placement after line 2 and a saved range ending at line 2, character 0. See `evidence/README.md` and paired recordings for the observed results.

For the fix, extend unit coverage for all boundary rules and focused UI coverage for both entry points, original/revision sides, split/unified layouts, and save/reopen. Assert the inline region's source line and captured request coordinates. Also run existing reply and suggestion workflows so this correction cannot silently move stored data.

## Risks / Trade-offs

- Excluding a newline narrows a fresh comment's range by one line break. Document and test the resulting suggested-replacement behavior.
- An adjusted endpoint can equal the start. Return a line comment to avoid an empty or reversed range.
- A visual wrap or tab can make a displayed length differ from a source column. Read the source model's line length and test tabs, Unicode, CRLF, and wrapping.
- Updating only one of the duplicate conversions would leave another trigger faulty. Route both through the same helper and test both with actual input.
- Existing saved ranges can still display at their original end line. Retain them to satisfy stored-anchor and reply requirements; this change has no data repair step.
- Linux fixture evidence does not prove live Gerrit or native macOS/Windows behavior. The API documentation confirms the required payload shape; a live-server check can verify persistence during implementation.

## Migration plan

No migration is required. Ship the renderer change and regression tests together. Revert the helper integration to roll back; stored drafts remain valid Gerrit comments.
