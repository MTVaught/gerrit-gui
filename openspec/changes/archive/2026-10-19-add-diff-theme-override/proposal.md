# Proposal

## Why

The in-app diff view always uses the application theme. Users need a separate diff theme choice and a way to find that choice in application settings without opening a review.

## What Changes

- Add one saved Diff theme setting with Light, Dark, and Follow application choices. Follow application is the default and follows the resolved application theme.
- Show the setting in Diff Preferences and in Settings > Appearance. Use the existing theme radio selector in Appearance. In Diff Preferences, use a label and dropdown that match the dialog's Gerrit-style fields. Both controls offer Light, Dark, and Follow application.
- Apply the override to the in-app review view, including its code editor and review dialogs. Keep the board and application settings on the application theme.
- Keep both controls in sync through application settings. Appearance saves immediately. Diff Preferences stages the theme until Save; Cancel discards it without changing the review. Store the theme locally, outside Gerrit account preferences.
- Omit the Diff theme explanatory subtext. Use the dialog's existing Save, Cancel, and error feedback.
- Preserve existing installations by defaulting missing or invalid diff theme values to Follow application.

## Capabilities

### New Capabilities

- `diff-appearance`: A persistent diff theme override, shared controls, and theme resolution for the in-app review view.

### Modified Capabilities

None. Existing comment overview requirements continue to apply in both themes.

## Impact

The change affects shared settings types and theme helpers, Electron and browser settings stores, shared theme option definitions, SettingsPanel, DiffPreferences, LocalReview, ReviewEditor, and review CSS. It uses existing settings transport and change notifications. It adds no dependency and does not change Gerrit account preferences or external Gerrit pages.
