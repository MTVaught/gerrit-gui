# review-windows Specification

## Purpose

Let users keep independent desktop windows for one or more reviews while sharing saved settings and confirmed review changes.

## Requirements

### Requirement: Separate review windows are optional

The desktop app SHALL provide an automatically saved "Open reviews in separate windows" setting under Settings > Window, defaulting to off. It SHALL apply to the next in-app review opened from the board or native menu without a restart. The control SHALL be unavailable when in-app reviews are disabled, while retaining its value. Changing it SHALL NOT move or close existing reviews. Browser mode SHALL retain its existing behavior.

#### Scenario: Keep the default viewer
- **WHEN** a user with no saved separate-window setting opens an in-app review
- **THEN** the review opens inside the current board window

#### Scenario: Enable separate windows
- **WHEN** the user enables separate windows and opens a review from the board
- **THEN** a separate review window opens and the board keeps its current view
- **AND** the setting remains enabled after app restart

#### Scenario: Disable separate windows with reviews open
- **WHEN** the user turns separate windows off while two review windows are open
- **THEN** both remain open and the next review opens inside the board window

#### Scenario: Disable in-app reviews
- **WHEN** the user disables in-app reviews with separate windows enabled
- **THEN** the separate-window control is unavailable and retains its saved value
- **AND** review links retain their existing Gerrit browser destinations

### Requirement: Each window stays on its selected review

A separate review window SHALL show only its selected Gerrit change and that change's review controls. It SHALL preserve the requested project, subject, target patch set, and base patch set. It SHALL allow files and patch-set comparisons within that change but SHALL NOT expose or navigate to a review board, another change, compact board mode, or board settings. Invalid review context SHALL show an error without a board fallback.

#### Scenario: Open a selected comparison
- **WHEN** the user opens change 42 at patch set 5 against patch set 3
- **THEN** the window identifies change 42 and shows that comparison
- **AND** its patch-set controls can select another comparison only within change 42

#### Scenario: Attempt to leave the review
- **WHEN** a board navigation action or route change targets a separate review window
- **THEN** the window does not display the board or another change

#### Scenario: Review context is unavailable
- **WHEN** a separate review window reloads and its review context cannot be recovered
- **THEN** it shows a review error and a close action without mounting the board

### Requirement: Duplicate review windows have independent view state

Each successful open action SHALL create a distinct review window, including repeated requests for the same change and comparison. File selection, patch-set comparison, code position, scroll, focus, dialog state, and unsaved composer text SHALL belong to that window. Closing, reloading, or navigating within one window SHALL NOT close, retarget, or reset another window.

#### Scenario: Open the same review twice
- **WHEN** the user opens the same change and comparison twice
- **THEN** two review windows coexist
- **AND** selecting another file or comparison in one leaves the other window's selection and position unchanged

#### Scenario: Close one duplicate
- **WHEN** the user closes one of two windows for the same change
- **THEN** the other remains open with its current file and unsaved text

### Requirement: App navigation does not close separate review windows

U and app-level review exit shortcuts SHALL leave a separate review window open and on its change. Escape SHALL leave the review open but retain its existing behavior in nested dialogs, menus, composers, and editor widgets. Shortcut help SHALL describe the separate-window behavior. These rules SHALL NOT change embedded review shortcuts or normal system close shortcuts.

#### Scenario: Press U or Escape in the review
- **WHEN** the user presses U or Escape with focus in a separate review and no nested control consuming the key
- **THEN** the review window stays open and no board appears

#### Scenario: Dismiss diff preferences
- **WHEN** the user presses Escape inside Diff preferences in a separate review window
- **THEN** Diff preferences closes and focus returns to its opener while the review stays open

### Requirement: Explicit closing protects review work

The window close button, normal system close shortcut, and explicit Close review action SHALL request closure of only that separate window. Closure SHALL use the existing unsaved-edit check and refuse closure while a review write is pending. Canceling closure SHALL preserve the window and its text. Successful closure SHALL destroy the review window instead of hiding it to the tray.

#### Scenario: Close with a system shortcut
- **WHEN** the user uses the normal system close shortcut with no unsaved edits or pending writes
- **THEN** only the focused review window closes
- **AND** the board and other review windows remain available

#### Scenario: Keep unsaved text
- **WHEN** the user clicks the window close button with unsaved text and cancels the discard prompt
- **THEN** the window remains open with that text unchanged

#### Scenario: A write is pending
- **WHEN** the user requests window closure while a draft save or review submission is pending
- **THEN** the review window stays open and closure becomes available after the write finishes

### Requirement: Confirmed review changes reach other views

After a successful in-app review write, other open views of the same change and the board SHALL refresh affected saved data without manual reload or focus change. This SHALL cover drafts, comments, votes, reviewer and attention changes, applied fixes, and reviewed files. Refresh SHALL preserve each view's local state and selected comparison. Failed writes SHALL NOT appear as confirmed changes in other views.

#### Scenario: Save a draft in one window
- **WHEN** a draft save succeeds in one of two windows for a change
- **THEN** the other window shows the saved draft after its automatic data refresh
- **AND** it keeps its selected file, comparison, scroll position, and unsaved composer text

#### Scenario: Publish a review or mark a file reviewed
- **WHEN** a vote publication or reviewed-file write succeeds in one window
- **THEN** other windows for that change reflect the saved result for the matching patch set
- **AND** the board refreshes affected change data after publication

#### Scenario: Receive an old response after a new write
- **WHEN** a read started before a confirmed write completes after a newer read
- **THEN** the old response cannot replace the newer confirmed state

#### Scenario: Refresh fails after a successful publication
- **WHEN** a review submission succeeds but another view's automatic refresh fails
- **THEN** that view shows a refresh error with retry and keeps its local state
- **AND** the submitting window does not report that the publication failed or invite a duplicate submission

### Requirement: Concurrent draft edits do not silently overwrite work

When another in-app window changes, deletes, or publishes a draft being edited locally, the app SHALL preserve unsaved local text and show a conflict. It SHALL stop stale autosave and reject stale explicit saves or deletes. The user SHALL be able to load the saved version or keep local text as a new draft. Separate new drafts SHALL remain distinct even when they use the same source location. Timestamp precision alone SHALL NOT cause a conflict with the editor's own successful save.

#### Scenario: Two windows edit one saved draft
- **WHEN** one window saves a draft after both windows loaded its earlier version
- **THEN** the second window keeps its unsaved text and reports the conflict
- **AND** a late autosave or explicit save from the second cannot overwrite the first window's saved version

#### Scenario: Another window publishes an active draft
- **WHEN** one window publishes or deletes a draft while another edits it
- **THEN** the editing window keeps its text and reports that the draft changed or no longer exists
- **AND** it does not recreate or republish the stale draft automatically

#### Scenario: Receive a refresh after the editor's own autosave
- **GIVEN** Gerrit returns fractional seconds on save and whole seconds when the same draft is read
- **WHEN** the successful autosave causes the editing window to refresh
- **THEN** that window keeps its local text, permits further saves, and shows no conflict
- **AND** this holds for both an embedded review with one dashboard window and a separate review window

#### Scenario: Another edit occurs within the same second
- **GIVEN** two windows loaded the same saved draft
- **WHEN** one window saves different text or resolution within the same stored timestamp second
- **THEN** the other window still reports a conflict and retains its local text
- **AND** its stale update and delete requests are rejected

#### Scenario: Keep conflicting text as a new draft
- **GIVEN** another window has made a real conflicting edit
- **WHEN** the reviewer chooses Keep as new draft
- **THEN** one distinct new draft is created with the retained local text
- **AND** further autosaves update that new draft without a repeated false conflict or extra copies
- **AND** the other window's saved draft remains unchanged

#### Scenario: Load the saved version after a real conflict
- **WHEN** the reviewer chooses Load saved version after another window edits the draft
- **THEN** the editor adopts the saved version and can autosave a later edit to the same draft
- **AND** its own subsequent refresh does not cause another conflict

### Requirement: Review windows follow connection changes safely

Review windows SHALL stop using cached data and pending results from an old server or account when the app connection changes. They SHALL retain unsaved text, stop old-context writes, and require closure and reopening before review writes resume. A renderer reload under the same connection SHALL restore that window's assigned change without changing any other window.

#### Scenario: Change the connected account
- **WHEN** the account or server changes while a review window has unsaved text
- **THEN** the window preserves the text, reports the connection change, and disables review writes
- **AND** results from the earlier connection cannot populate the new connection's views

#### Scenario: Reload one review window
- **WHEN** one review renderer reloads under the same connection
- **THEN** it reopens its assigned change and initial comparison without mounting a board or retargeting another review window
