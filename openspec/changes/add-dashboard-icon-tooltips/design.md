# Design

## Context

See proposal.md for scope and motivation. `PatchSetIndicators` in `ChangeRow.tsx` already supplies native `title` text for conflict and Verified icons. The compact ledger imports this component. Conflict warnings have an accessible name, while CI indicators are plain spans. Sequence completion checks, private badges, comments, and toolbar controls also use native titles. SVG components in `Icons.tsx` are decorative and hide themselves from assistive technology.

The renderer has no shared tooltip component or tooltip package. Existing dashboard UI scripts use Electron with simulated preload data. `test/merge-conflict-ui.cjs` already checks both layouts, themes, and conflict refresh behavior.

## Goals / Non-Goals

- Use one tooltip implementation with no new package dependency.
- Keep each icon's meaning with its owning component, rather than giving every check SVG a global meaning.
- Keep layout wrappers stable, including the hidden `SizerRow`. Do not add focus targets to hidden sizing content.
- Do not change dashboard data reads or introduce conflict resolution actions.

## Decisions

### Shared tooltip component

Add `Tooltip.tsx` with one trigger and a portal into the document body. Use `role="tooltip"`, a stable ID, and `aria-describedby`. Keep icon control accessible names on their buttons. For status indicators, use a focusable span with an appropriate accessible name; decorative SVGs stay hidden. Avoid nested interactive elements and preserve existing refs, event handlers, and classes.

Open after a short hover delay of about 300 ms and immediately on focus. Keep help open while pointer or focus remains on its trigger, and while the pointer is over its content. Escape closes help until the next pointer entry or focus entry. Clear timers and listeners on unmount. Hide help if its trigger leaves the document or its view closes. Tooltips contain text only.

Native titles alone cannot provide reliable keyboard help or controlled theme styling. Remove duplicate native titles from migrated triggers so two tooltips do not compete. A CSS-only tooltip would be smaller but cannot reliably escape dashboard clipping or handle Escape dismissal.

### Position and theme

Position the portal relative to the trigger bounds. Prefer above, flip below when needed, and clamp to a viewport margin. Use a wrapping maximum width. Recompute on scroll and resize, and keep pointer travel possible between the trigger and content. Use existing theme colors for the tooltip surface, border, text, and focus outline. Portals avoid clipping by ledger and card containers without changing row dimensions.

### Text and coverage

Use the exact conflict text from the existing specification. Explain CI as "CI checks passed. Verified +1 on patch set N." or "CI checks failed. Verified -1 on patch set N." For other nonzero Verified values, show the actual vote rather than replacing it with +1 or -1. Keep the sequence step's actual state, such as "Step 2: Approved", distinct from CI results.

Migrate meaningful icon triggers in `App.tsx`, `ChangeRow.tsx`, `Ledger.tsx`, and their dashboard row controls. This includes comments, branch family, sequence, private status, refresh, window size, settings, split-menu carets, and reviewer icon actions. Reuse existing contextual action text where it is accurate. Exclude decorative icons whose adjacent label fully explains them and controls inside settings, local review, or tray menus.

### Verification and evidence

Extend the existing dashboard fixture workflow with actual pointer hover and Tab/Escape input. Cover passed and failed CI, conflict with and without CI, unknown data, sequence checks, and refreshed tooltip context. Check accessible descriptions, no duplicate native titles, retained button actions, no row size changes, and viewport clipping in both layouts.

Use the record-actions skill for matched light and dark videos of hover, focus, and dismissal. Keep the pointer visible and pause over each target before moving. Capture matched screenshots for tooltip text and edge placement. Inspect every artifact and state that Gerrit data is simulated and which platform was tested.

## Risks / Trade-offs

- Extra keyboard stops on dense boards increase traversal time. Add stops only for meaningful status icons that need help; keep existing action buttons as single stops.
- Portals can leave stale help after refresh or scrolling. Derive text from current props, track bounds, and clear help when its trigger disappears.
- Event wrappers can change row actions. Test clicks and keyboard activation on the existing buttons and retain their original handlers.

## Migration plan

Ship the renderer change without data migration. Roll back by reverting the tooltip component and its integrations. Existing native-title behavior can then resume.
