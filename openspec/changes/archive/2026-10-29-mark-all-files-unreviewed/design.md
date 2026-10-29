# Design

## Context

See proposal.md for motivation. `ReviewFileList` receives the reviewed set, a busy flag, and a per-file callback. `LocalReview` loads reviewed paths for the target patch set separately from the comparison's file list. Its `pendingMarks` protects closure, and `autoMarkedVisit` limits automatic marking to one attempt per file visit. `setReviewFileReviewed` already calls Gerrit's per-file PUT or DELETE through service write checks. Desktop writes enter the same-change mutation queue and notify other views after success.

The main file-navigation spec covers pane sizing and access. This change adds requirements to that capability without replacing them. Existing review-window refresh and connection rules still apply.

## Goals / Non-Goals

**Goals:** Keep the operation in the existing review state owner, reuse confirmed per-file writes, and make failure recovery explicit.

**Non-Goals:** No bulk Gerrit endpoint, new persistence, transaction rollback, or change to the saved automatic-marking preference.

## Decisions

### Use a compact glyph in the file-pane heading

Place a 22 px crossed-out checkmark button beside Files and the reviewed count in the same heading. Keep "Mark all unreviewed" as its accessible name and tooltip. During a reset, use a dashed glyph, `aria-busy`, and the pending accessible name and tooltip "Marking all unreviewed...". Pass an explicit reset callback and pending state from `LocalReview`. Keep visible keyboard focus in both themes. At narrow widths, the reviewed count can wrap within the heading while the glyph keeps its size. A confirmation dialog adds a step to an action the user can reverse with existing per-file controls, so this plan does not add one.

### Reset all reviewed paths for the target patch set

Take a snapshot of the loaded reviewed-path set, independent of the filter and comparison paths. This includes Gerrit pseudo-files such as the commit message when their reviewed flags exist. Enable the button from this full set, even when the visible comparison's count is zero. A tooltip explains "Clear your reviewed flags for all files in this patch set." Restricting the operation to visible rows would leave hidden progress behind.

### Run sequential writes with one operation guard

Capture the change, target patch set, and connection context. Hold a reset guard across the whole loop and final status reconciliation, including gaps between individual calls. Reuse `api.setReviewFileReviewed(link, path, false)` sequentially. Remove a path locally only after its write succeeds. Stop on the first error, preserve confirmed results, and use the existing reviewed-status reload before retry. Do not call the current `markReviewed` repeatedly without changes, since it clears the shared error and releases busy state after each call.

Extend pending-state checks for closure, comparison selectors, keyboard actions, and per-file marking. The reset must not wait for a mark that it blocks itself. Disable its start while another mark is pending. Stop remaining requests if the connection becomes blocked and reject stale state updates with a captured context check. Use existing service permission checks and mutation events for each confirmed write; no new IPC channel is needed.

### Keep refreshes and automatic marking from reversing the reset

Suppress automatic marking while the reset runs. Record the current `fileKey` as already handled for this visit before clearing flags. Keep that visit marker through final status reload and error recovery; the current Retry handler clears it and must distinguish a status retry after reset. Navigating to a different file allows normal marking again. Do not change preferences.

A reviewed-status read can race with later successful deletes. Defer or invalidate reads during the loop, then fetch once after it settles. Keep a generation check so an older response cannot restore cleared flags. Other windows use the existing confirmed-write refresh path; an idle current visit must not restart automatic marking just because its status changed.

## Risks / Trade-offs

- Sequential requests take longer for large patch sets. Show pending state for the whole operation and send no requests for files already unreviewed.
- Gerrit offers no transaction through the existing API. Stop on failure, show partial progress, and retry from server status without restoring successful clears.
- Connection changes or old reads can overwrite current state. Stop remaining requests and guard both reads and writes with the active context and generation.
- Existing automatic-marking retry behavior can reverse a reset. Cover success, status refresh, and partial-failure retry with automatic marking enabled.

## Migration plan

No data migration is required. Deploy the renderer change with the existing service. Reverting the change removes the button; confirmed Gerrit flag changes remain and can be changed per file.

## Evidence plan

For this planning change, capture and inspect the validated artifact report in matching light and dark screenshots. Label it as planning evidence, not working feature proof.

During implementation, use the record-actions skill to capture matching light and dark videos on Linux. Start with the same partly reviewed patch set, enable the filter, hover over the reset button for two seconds, activate it, and pause on the zero count and restored rows. Also verify persistence after reopening, automatic marking, partial failure, keyboard access, narrow-pane wrapping, and another review window. State which data and failures are simulated. Save paired filenames with `-light` and `-dark` suffixes and inspect both before sharing.
