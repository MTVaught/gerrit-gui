# Design

## Context

See proposal.md for the user need. The application resolves `theme` with `useTheme` and sets `data-theme` on the document root. `LocalReview` is a full-screen dialog in the same document, not a separate Electron window. `ReviewEditor` observes the root attribute and calls Monaco's global theme setter.

`SettingsPanel` has a private `SettingsChoices` radio group. Appearance currently uses it for Light, Dark, and System. SettingsContext provides shared settings and partial saves. Desktop and browser settings stores each normalize and persist the application theme. Application settings already have change notifications.

`DiffPreferences` stages Gerrit account preferences until Save. Fit to screen is local. `LocalReview.savePreferences` writes Gerrit first and only then saves the local preferences. The save handler must support a local theme write on Save and skip Gerrit when only the theme changed.

## Goals / Non-Goals

Goals are one source of saved theme state, a review-only theme boundary, and accessible theme controls that match each location's existing style. The implementation must keep live editors and drafts mounted during theme changes.

This design does not add custom color palettes, per-file or per-project themes, or theme changes to external Gerrit pages. It does not move other diff preferences into application settings.

## Decisions

### Store a separate application setting

Add `DiffThemePreference = 'light' | 'dark' | 'application'` and a `diffTheme` field to settings input and status. Add normalization and resolution helpers alongside the existing theme helpers. Resolve the diff theme against the resolved application theme, never directly against the device preference.

Persist the value in both `src/main/settings.ts` and `src/server/file-settings.ts`. Missing or invalid values normalize to `application`. Use SettingsContext saves and existing settings notifications so both controls use the same state. Keep the value out of `ReviewPreferences` and Gerrit request payloads. A localStorage-only value would create a second settings store and would not use the existing application settings notifications.

### Match each location's existing controls

Share the Diff theme option values and labels between the two locations. In Settings > Appearance, reuse `SettingsChoices` for Light, Dark, and Follow application below the existing Theme radio group. Keep the application Theme control unchanged.

In Diff Preferences, use a native select with a Diff theme label. Match Context and Ignore Whitespace: the same label and control columns, font weight, select width, border, padding, and row spacing, including the compact layout. Keep the dialog's Gerrit-style form. Do not add application settings radio cards to this dialog. Associate the select with its label, and retain standard select keyboard behavior and a visible focus indicator. Sharing option definitions and saved state keeps the choices consistent without forcing the same visual control into both locations.

Place the new Appearance control below Theme. Place the Diff Preferences control as a normal row in the existing form fieldset, before Context, with the same row spacing. Omit the Diff theme explanatory subtext in both locations. Do not add a separate theme status or divider in Diff Preferences.

### Follow each location's save convention

Appearance saves immediately through SettingsContext and uses the existing settings status. Diff Preferences initializes a separate theme draft from the saved application setting when opened. Selecting an option changes only this draft. It does not write settings, update Appearance, or preview the theme. Save commits the draft through application settings. Cancel or Escape discards the draft. The theme select shares the dialog's disabled state and existing save error feedback.

Pass the theme draft to the save handler separately from ReviewPreferences so it stays out of Gerrit payloads. Compare the staged fields against their opening values. A theme-only Save skips Gerrit and saves only diffTheme. If Gerrit-backed fields also changed, save them first and commit the theme only after that succeeds. A failed required write keeps the dialog open with its draft and an error. A theme write failure keeps the last saved theme active. Do not close the dialog until all required writes succeed. On retry, do not repeat already confirmed writes.

The two stores do not provide a shared transaction. A successful Gerrit write cannot be rolled back if the later local theme write fails. Keep the confirmed fields as the retry baseline and report the local failure through the existing dialog error. Closing after a failure discards only uncommitted drafts. This follows the Save convention while keeping a theme-only change independent of Gerrit.

### Scope the theme to the review

Keep the document root on the application theme. Resolve the diff theme from settings and place a `data-review-theme` attribute on the `LocalReview` dialog. Share the existing palette definitions between the root theme and review theme selectors. Set `color-scheme` at the review boundary so native controls also match.

Update review-specific dark rules that currently depend on `:root[data-theme="dark"]`, including rebase highlights, line counts, and suggested fixes. Ensure nested review dialogs inherit the review palette. For any dialog rendered outside the review subtree, pass the effective review theme and apply the same boundary. Browser top-layer rendering alone does not change DOM inheritance.

Pass the effective light or dark theme to `ReviewEditor`. Update Monaco's theme in a separate effect so theme changes do not dispose models, recreate the editor, reset scroll, or discard drafts. Remove the root-only theme observer. Monaco's theme setter is global, but the current provider mounts only one local review; this design does not add concurrent review instances. Temporarily changing the document root was rejected because it would also recolor the board and settings.

### Verify behavior and record evidence during implementation

Extend `src/shared/theme.test.ts` with normalization and the resolution matrix, including opposite application and device themes. Cover browser store reopening and unrelated saves, following the existing file-settings test pattern. Verify that Gerrit preference payloads remain unchanged and theme-only saves use application settings.

Use real browser input to verify immediate saving in Appearance, staged selection and Save in Diff Preferences, Cancel and Escape behavior, failure feedback, and review continuity with fixture review data. Capture matched screenshots of both control locations and opposing app/review themes. Record the selection and synchronization workflow in both modes with the record-actions skill. Inspect all evidence and state the platform and simulated data. Run `pnpm test` and `pnpm typecheck` after implementation.

## Risks / Trade-offs

- Root-dependent review CSS could leave mixed colors. Audit the selectors and inspect code, comments, dialogs, and highlights with opposite app and diff themes.
- A combined Save spans Gerrit and application settings. Save the theme last, keep the dialog open on failure, and retry only pending writes. Verify that Cancel and Escape leave an uncommitted theme unchanged.
- Recreating Monaco on theme changes could lose review position. Keep theme application separate from editor creation and verify position and draft continuity.
- Two settings stores can drift. Update both in the same change and verify persistence in browser mode and desktop mode.

## Migration plan

No data conversion is required. Existing settings resolve to Follow application. Ship both store changes with the renderer change. Rollback ignores the extra setting and restores the former behavior of following the application theme.
