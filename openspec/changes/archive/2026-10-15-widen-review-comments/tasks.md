# Tasks

## 1. Overview layout and focus

- [x] 1.1 Add the dedicated All comments dialog shell in `ReviewComments.tsx`, with an accessible title, fixed header, filters, Back to review button, Esc hint, and scrollable thread list. Add scoped rules in `styles.css`. Verify at desktop and narrow viewport sizes that the dialog occupies about 90% of the width, retains a background margin, and has no horizontal page overflow in both themes.
- [x] 1.2 Set initial focus on Back to review and return focus to the visible Comments summary on ordinary dismissal. Update the overview checks in `test/review-comments-ui.cjs` for the new title, close control, scroll behavior, focus containment, and focus restoration. Verify the checks pass and that a long list does not move the header or filters.

## 2. Dismissal and review continuity

- [x] 2.1 Route Back to review, Escape, and a completed background click through the overview-close callback. Consume dismissal events and require the pointer gesture to begin and end outside the dialog bounds. Add real-input checks that each action closes only All comments, inside and padding clicks leave it open, a drag from inside to outside leaves it open, and the background click does not activate a review control.
- [x] 2.2 Extend the review UI checks to verify file, comparison, code scroll position, and draft state survive each ordinary dismissal. Keep checks for filters, comment-location navigation, cross-file reply, and editing drafts. Verify that intentional navigation reveals the target with usable focus.
- [x] 2.3 Run the existing publishing, draft, deletion, fix-preview, outline, and blame checks to verify their layout and dismissal rules remain unchanged. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and the Electron review-comments fixture with the available display runner; record the commands and results.

## 3. Application evidence and final checks

- [x] 3.1 Use the record-actions skill to record the same workflow in light and dark mode: open All comments, scroll a long list, use the return button, reopen and press Escape, then reopen and click the background. Use real input, visible pointer motion, captions, and comparable framing. Inspect both recordings and save paired `-light` and `-dark` artifacts. State the tested platform and simulated fixture data.
- [x] 3.2 Capture and inspect paired application screenshots for the implemented layout at matching data and scroll positions. Add the captures and a short evidence note under `docs/screenshots/review-comment-overview/`, including links to the recordings and check results. Verify the note distinguishes the planning previews from the implemented behavior, and report any remaining capture limitation explicitly.
