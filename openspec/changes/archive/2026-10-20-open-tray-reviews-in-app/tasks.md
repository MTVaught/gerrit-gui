# Tasks

## 1. Native routing and delivery

- [x] 1.1 Add a typed native review request, readiness signal, and acknowledgment to the shared API and Electron preload, with browser-mode no-ops and fixture compatibility. Verify type checks and trusted IPC boundary tests pass.
- [x] 1.2 Add native change routing in main that reads the saved opt-in on each selection, preserves opt-out URLs, and resolves the selected member's own subject and required patch set with `service.fetchChange`. Add focused tests for all four categories, explicit comparisons, metadata failures, and preference changes without restart.
- [x] 1.3 Retain the latest request until the renderer is ready and acknowledges it. Restore, show, and focus the main window. Add tests for window creation, reload, duplicate delivery, out-of-order metadata reads, and two selections before readiness.
- [x] 1.4 Connect both single and grouped native menu entries to the routing handler and update browser-only comments in the tray and shared menu contracts. Verify disabled entries, category actions, counts, and existing platform icon click tests remain unchanged.

## 2. Review viewer integration

- [x] 2.1 Subscribe through the existing review provider, announce readiness after listener setup, and remove listeners on unmount. Clear the Settings view for native navigation and reuse the existing mutation callback. Verify a fixture request opens the selected review in normal and compact modes with Settings initially open.
- [x] 2.2 Apply the existing unsaved-edit and pending-write checks before replacing a review, and support a new comparison of the same change. Add checks for canceled discard, accepted navigation, saved drafts, pending writes, and same-change comparison updates.
- [x] 2.3 Show native navigation failures in the app and acknowledge handled or canceled requests. Verify a failure preserves an active review, a later valid selection succeeds, and neither case silently launches a browser.
- [x] 2.4 Extend the Electron review fixture checks to verify selected branch and sequence members, Needs Review comparisons, other categories against base, preference changes, and unchanged explicit web actions. Run the fixture and verify recorded destinations and viewer state.

## 3. Integration and visual evidence

- [x] 3.1 Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and the changed Electron fixture checks. Record the results and resolve failures caused by this change.
- [x] 3.2 Use the `record-actions` skill to record real native menu selections with the opt-in enabled and disabled, including hidden-window restoration and the resulting comparison. Capture the same workflow with fixed data and pacing in light and dark mode. Save paired `-light` and `-dark` videos, inspect both, and link them in the completion report. State the tested platform and any simulated Gerrit data. If native capture remains blocked, report the exact limitation and mark native visual verification incomplete.
