# Design

## Context

See `proposal.md` for the problem and scope. `LocalReview` loads a `ReviewPreferences` record from localStorage, then reads Gerrit preferences on review mount. A sync marker controls whether the remote context replaces the local context. `DiffPreferences` stages all fields and the theme until Save. `commitDiffPreferences` writes Gerrit, localStorage, and then application settings.

Diff theme already belongs to application settings through `SettingsContext`, with a second control in Appearance. Both desktop and browser settings use `settingsStore`. Other review preferences already have validation and defaults in `review-preferences.ts`. The browser server exposes service methods by name, so leaving the old service methods would leave a callable Gerrit preference path.

The current `diff-appearance` spec requires Save, Cancel, and ordered Gerrit/theme writes. The delta replaces those rules. The independent theme and review appearance requirements remain in force.

## Goals / Non-Goals

Goals:

- Reuse the existing application stores and preference validation.
- Remove the account preference path across the typed API and both runtime modes.
- Apply edits without remounting the review, editor models, or comment editors.
- Handle invalid number entry, write failure, and rapid theme changes without losing confirmed settings.

Non-goals:

- No new cross-device, account, project, or file preference scope.
- No change to Gerrit content reads, comment writes, votes, or reviewed-file operations.
- No new settings panel, theme system, or storage service.

## Decisions

### Retain the existing application stores

Keep non-theme preferences in `local-review-diff-preferences` and Diff theme in the existing application settings field. Use the current parser and defaults. Remove the sync flag argument and marker logic. Remove the Gerrit conversion helpers when their last consumers are removed.

These stores already retain the settings required here. Moving every preference into the main settings file would add schema and migration work without being needed to separate them from Gerrit. The scope remains the local application profile for review preferences, with browser localStorage scoped to its origin. This change does not promise synchronization between browser profiles or desktop installations.

Preserve valid values already stored locally, even if an earlier application version obtained them from Gerrit. Their stored origin does not justify resetting a user's choices. If no valid local record exists, use the application defaults without a one-time Gerrit import. Ignore the legacy sync marker. It can remain inert without affecting settings.

### Remove account preference access end to end

Remove the mount-time Gerrit preference read from `LocalReview` while retaining its patch-set polling. Replace the commit helper with local update handling. Remove `reviewDiffPreferences` and `saveReviewDiffPreferences` from the shared API, renderer browser adapter, preload, IPC handlers, main service, and Gerrit client. Remove `GerritDiffPreferences` if no consumers remain.

Remove fixture implementations and revise tests that expect account preference reads or writes, including the combined service detail test. Keep reviewed-file writes and `autoMarkReviewed` behavior. That setting controls when an existing reviewed-file operation is requested; it is not permission to write account preferences. A read-only review still permits local setting edits and keeps its existing write restrictions.

Removing only renderer calls was considered, but it would keep unused writable service and IPC methods. Deleting the complete unused path makes the boundary testable in both runtime modes.

### Apply valid edits through field updates

Replace `onSave` with change callbacks that identify the changed field. Use the latest confirmed preference state when merging patches, rather than a snapshot captured when the dialog opened. For synchronous localStorage preferences, validate, write, then publish the new state in the same input event. On write failure, keep the last confirmed value and show an accessible error. Successful edits to other fields remain intact.

Keep the current form layout, labels, dropdown options, and checkboxes. Replace its footer with Close. Remove submit handling, saving text, Cancel, and the Gerrit sync message. Use this helper text: "Changes apply automatically in this application." Close and Escape dismiss only the preferences dialog, restore opener focus, and do not undo confirmed edits. Enter must not submit or close the form.

Number controls need a local text buffer because an empty entry is a normal part of typing. Validate integer values against the existing field bounds before applying. Show accessible feedback for invalid entries; do not convert an empty string to zero, clamp it, or persist it. Closing drops only invalid text. Fit to screen disables the width input without changing the saved fixed width.

Retaining full-dialog drafts would keep the old commit model. Per-field updates let the application apply each valid edit and isolate failures.

### Keep one shared theme setting and order asynchronous updates

Use `SettingsContext.save({ diffTheme })` for automatic theme persistence and both selectors' confirmed value. The theme applies as part of processing the selection event, without a submit action. Keep the dialog open, including while a write is pending. Confirm a theme through the existing settings save result; a failed write retains the last confirmed theme, resets the selector to it, and shows the error in the dialog.

Serialize pending theme writes in input order and retain a monotonically increasing selection revision. Keep the newest requested selection visible while writes are pending. Do not let older completions replace that selection or report a stale failure as the current result. At queue completion, both controls and the review must use the final confirmed value. A failed final choice returns to the last successful theme, allowing the same choice to be selected again. Do not rewrite unrelated review fields as part of theme completion.

Keep pending work outside dialog lifetime, so Close or Escape does not cancel a submitted valid change or clear an unresolved error. Reopening must expose any current failure. Successful retry clears the relevant error. Do not disable the whole preference form for an asynchronous theme write.

### Preserve the review instance

Continue passing updated preferences to the existing editor and using the current independent diff theme boundary. Do not key or remount the review on a preference change. Preserve the selected comparison, file, source position where the new layout permits, and comment drafts. Context and whitespace changes can recompute the diff, but must retain the full source and its comment anchors.

## Risks / Trade-offs

- Browser storage can be blocked or full. Keep last confirmed values on write failure and show a local error. Reuse parser fallback for unreadable or corrupt records.
- Rapid theme selections can complete out of order. Serialize theme writes and ignore stale UI results by selection revision. Test delayed success and failure while other fields change.
- Existing fixtures assume Save and Gerrit synchronization. Update them with the API removal and assert zero account preference requests during review opening and all edits.
- LocalStorage and application settings retain their existing different scopes. Document that boundary; a unified preference store is outside this change.

## Migration plan

Ship the renderer changes, API removal, and fixture updates together. Keep the localStorage key and `diffTheme` schema unchanged. Load existing valid fields, default invalid fields, and ignore the old sync marker. Do not contact Gerrit during migration.

Rollback requires no local data conversion because the storage formats remain unchanged. An older application version restores its previous Gerrit synchronization behavior. This change cannot undo Gerrit preference writes made before the update.

## Verification and evidence

Extend `review-preferences.test.ts` for persisted records, default fallback, and sync marker independence. Replace commit-helper tests with tests of validation, local write failures, per-field merges, and theme write ordering. Revise service tests and fixtures so they no longer depend on the removed account preference methods. Keep meaningful coverage of reviewed-file permissions and whitespace source-column mapping.

Update `test/review-ui.cjs`, `test/diff-theme-ui.cjs`, and their fixtures to use real input without Save. Check every control, invalid number entry, Close/Escape, review continuity, appearance synchronization, storage failure and retry, rapid edits, restart/reload, and read-only operation. Observe outbound traffic and assert zero requests to `/accounts/self/preferences.diff`, while ordinary review operations still work. Run `pnpm test`, `pnpm typecheck`, and the relevant browser and Electron UI workflows.

For this planning change, capture matched static light and dark previews of the proposed dialog. Label them as proposal mockups, with simulated values and no claim of runtime behavior. During implementation, use the `record-actions` skill to record automatic application and persistence through real input on Linux desktop and browser mode. Keep the pointer visible, hover about two seconds before clicks, add brief captions, and pause on results. Use comparable data, framing, scroll position, starting state, and pace in both modes. Save paired artifacts with `-light` and `-dark` suffixes, inspect each, and state the tested platform and simulated data. If runtime capture remains blocked, mark visual verification incomplete and report the exact limitation.
