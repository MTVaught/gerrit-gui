# Design

## Context

See proposal.md for the user problem. All comments currently uses the SendReview helper in `ReviewComments.tsx`. That helper also owns publishing, composition, deletion, and fix-preview dialogs. It opens a native modal dialog, handles Escape, and attempts to restore the previously active element. The overview's sole Close button follows all thread content. `styles.css` sets the shared width to 560 px and makes the entire dialog scroll.

The review itself fills the viewport. Comment location buttons and cross-file composition already dismiss All comments through its state. Existing Electron fixture checks cover filtering and cross-file replies in `test/review-comments-ui.cjs`.

## Goals / Non-Goals

Goals: Keep native modal focus containment; limit the change to the overview; keep existing thread rendering and navigation; make pointer dismissal safe.

Non-goals: Change comment storage, publishing, inline thread layout, draft saving, or other dialogs. No new dependency or persistent window-size preference is needed.

## Decisions

### Give the overview its own dialog shell

Use a dedicated overview component in `ReviewComments.tsx`, with a named dialog and its own CSS class. Reuse existing filters and `renderThread` output. Keep SendReview behavior unchanged. A dedicated shell avoids adding a set of unrelated layout and dismissal flags to the shared helper.

The shell has three rows: header, filters, and scrollable thread list. Use a flex column with `min-height: 0` on the list. Start with 90vw width and 88vh height, matching the preview. Use border-box sizing, wrap header and filter controls on narrow windows, and constrain content to the available width. Existing theme variables supply colors. A larger shared width was rejected because it would alter other review dialogs.

### Keep the exit visible

Put All comments and the existing explanatory text at the left of the header. Put Back to review and an Esc hint at the right. Remove the trailing Close button from this overview. The header and filters remain outside the scroll container. Give the dialog an accessible name, set initial focus on Back to review, and restore focus to the Comments menu summary on ordinary dismissal. The former All comments menu item is hidden after selection, so it is not a suitable return-focus target. Location navigation must retain focus on the revealed code or composer instead.

### Scope background dismissal to the overview

Route the return button, native cancel event, and background click through one overview-close callback. Prevent cancel propagation so Escape cannot close the outer review. Track a primary pointer gesture that begins and ends outside the dialog bounds, with the dialog itself as the event target. A click on dialog padding is inside and must not dismiss. Require a completed click so text selection dragged from inside to outside does not dismiss. Consume the background event so it cannot activate a review control beneath the modal. Do not apply this behavior to SendReview.

Relying only on `event.target === dialog` was rejected because clicks on padding also target the dialog. A separate page overlay was rejected because the native modal already provides a backdrop and focus containment.

### Preserve review state

Dismiss by changing only the All comments open state. Do not reset the file, comparison, editor, filters, or drafts. Continue using existing location and composition handlers for intentional navigation. Do not add a confirmation prompt to ordinary overview dismissal.

### Use application captures for design review

The paired images under `previews/` show the proposed layout in the running renderer with temporary DOM and CSS changes, using the existing simulated review fixture in Chromium on Linux. They are static design references, not evidence of implemented dismissal behavior. The latest background-click decision requires implementation verification and does not change the pictured layout.

## Risks / Trade-offs

- Nested native dialogs can send cancel or pointer events to the wrong layer. Stop propagation and verify the outer review stays open after each dismissal action.
- The 90% width leaves a narrow background target. Keep the labeled return button visible and verify the margin remains usable at smaller sizes.
- Refocusing a hidden menu item can fail. Return to the visible Comments summary and verify keyboard navigation after dismissal.
- A wide layout can hide text overflow on small windows. Check long paths, filters, and the return button in both themes at desktop and narrow sizes.

## Migration plan

No data migration is needed. Ship with the normal renderer build. Reverting the dedicated shell and its styles restores the previous overview without changing saved drafts or review data.
