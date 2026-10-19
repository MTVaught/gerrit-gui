# Tasks

## 1. Saved theme model

- [x] 1.1 Add DiffThemePreference, the diffTheme settings field, and normalization and resolution helpers. Extend theme tests to cover missing and invalid values, explicit overrides, and Follow application when app and device themes differ. Verify with `node --test src/shared/theme.test.ts`.
- [x] 1.2 Persist diffTheme in the Electron and browser settings stores and preserve it during unrelated saves. Add store coverage following the existing theme persistence test. Verify browser store reopening with the test and desktop persistence by saving, restarting, and reading the control.

## 2. Shared controls

- [x] 2.1 Share Diff theme option values and labels between both locations. Reuse SettingsChoices within Appearance and retain the application Theme group with Light, Dark, and System. Verify native radio keyboard navigation and visible focus.
- [x] 2.2 Add Diff theme below Theme in Settings > Appearance using SettingsContext and immediate saving. Verify all three choices save, survive reopening, and show the existing save status without opening a review.
- [x] 2.3 Add a labeled Diff theme dropdown as a normal staged row in Diff Preferences, with no explanatory subtext or separate status. Match Context and Ignore Whitespace styling, spacing, and compact layout. Verify select keyboard navigation and visible focus in both themes. Verify selection alone changes no saved state or review appearance; Save commits the theme, and Cancel or Escape discards it.
- [x] 2.4 Coordinate the existing Save handler with the staged theme. Skip Gerrit on theme-only saves; save changed Gerrit fields before the theme on combined saves. Use the existing disabled state and error feedback. Verify theme-only saving in read-only mode, failures retain the dialog draft, failed theme writes retain the active theme, and retries skip confirmed writes.

## 3. Review theme boundary

- [x] 3.1 Apply the resolved diff theme to LocalReview and its nested dialogs. Share palette definitions and update root-dependent review styles. Verify opposite app and diff themes for comments, highlights, native controls, Diff Preferences, and All comments. Confirm closing the review leaves the board and settings on their application theme.
- [x] 3.2 Pass the effective diff theme to ReviewEditor and apply Monaco theme changes without recreating editors or models. Verify a live change preserves the file, comparison, scroll position, and draft. Check Follow application responds to both application changes and device changes under System.

## 4. Integration checks and evidence

- [x] 4.1 Run `pnpm test` and `pnpm typecheck`. Exercise both controls in browser mode and desktop mode, including saved values after restart and unchanged Gerrit preference payloads. Record actual platform results and any limits.
- [x] 4.2 Use the record-actions skill to record real input actions for selection, reopening the other control, and persistence in matched light and dark workflows. Use labeled fixture data if needed. Capture paired screenshots of both control locations and opposite app/review themes. Save artifacts with -light and -dark suffixes, inspect readability and layout, and link both versions in the implementation report.
