# Proposal

## Why

Dashboard icons do not explain their meaning at a glance. Conflict and CI indicators already have native hover text, but users need clear, consistent help that also works with keyboard focus.

## What Changes

- Add visible tooltips for dashboard status icons and icon-only controls in standard cards and the compact ledger.
- Explain the conflict triangle, CI check and X, sequence completion check, unresolved comments, branch family, sequence, and private indicators. Explain dashboard toolbar and row icon controls by their action.
- Show tooltips on hover and keyboard focus. Support Escape dismissal and readable light and dark themes.
- Keep branch, patch-set, state, count, and action context in the text. Keep CI results separate from review approval and sequence completion.
- Preserve current icon display rules, layout, workflow states, permissions, and actions. Settings content, local review, tray menus, and new status indicators are outside this change.

## Capabilities

### New Capabilities

- `dashboard-icon-help`: Consistent, accessible tooltip behavior and contextual text for dashboard icons.

### Modified Capabilities

- `merge-conflict-indicators`: Require the existing conflict explanation on keyboard focus as well as hover, using the shared dashboard tooltip behavior.

## Impact

Renderer changes will affect `App.tsx`, `ChangeRow.tsx`, `Ledger.tsx`, dashboard icon controls, and `styles.css`. A shared tooltip component will avoid separate behavior in each view. UI checks will extend the existing simulated dashboard fixtures and merge-conflict workflow. No Gerrit API, stored data, or new package dependency is planned.
