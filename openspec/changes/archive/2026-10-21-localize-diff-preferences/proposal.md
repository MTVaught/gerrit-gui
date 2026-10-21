# Proposal

## Why

Diff Preferences currently reads and writes the user's Gerrit account settings. Review window settings must belong to this application, and each valid change must take effect without a Save action.

## What Changes

- Make every Diff Preferences field local to the application. Stop reading and writing Gerrit account diff preferences.
- Apply and persist valid changes as the user makes them, including Diff theme. Keep the dialog open while the user adjusts settings.
- Remove Save, Cancel, staged submission, and the account sync message. Provide Close and Escape to dismiss the dialog without undoing applied changes.
- Preserve existing valid local review preferences and the saved diff theme. Use application defaults for missing or invalid values. Do not import Gerrit values.
- Keep the existing Gerrit-style controls, shared Diff theme setting, and review continuity. Validate number fields before applying them and report local storage failures.
- Remove the unused Gerrit diff preference API path in desktop and browser mode.

## Capabilities

### New Capabilities

- `review-preferences`: Application-owned review settings, automatic application, validation, persistence, and independence from Gerrit account preferences.

### Modified Capabilities

- `diff-appearance`: Replace Save and Cancel theme behavior with automatic application and local persistence. Retain the shared theme controls and theme continuity requirements.

## Impact

- Renderer: `DiffPreferences.tsx`, `LocalReview.tsx`, `review-preferences.ts`, the existing diff preference commit helper, and related tests.
- API: shared API and Gerrit preference types, preload, renderer browser API, main IPC, service, and Gerrit client. Remove account diff preference methods; retain review content and reviewed-file operations.
- Storage: retain the existing application localStorage review preference record and application settings `diffTheme`. Stop using the Gerrit sync marker. No new dependency or settings service is required.
- Verification: revise the existing review and theme fixtures, check that no account diff preference requests occur, and capture the automatic application workflow in light and dark mode on desktop and browser builds.
