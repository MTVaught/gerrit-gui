# Design

## Context

See `proposal.md` for motivation. `tabSegments()` currently counts the card leads returned by `cardGroups()`. It combines review modes and draft stages, pulls Private and Sequences into separate buckets, and omits Ready to Merge. `TabCount` subtracts segments from a card total to render a remainder and a separate lock. This arithmetic assumes card counts and cannot serve the new individual-change summary.

`Board` and `Ledger` both attach `g.rows.length` to section headings. Their grouped rendering and family branch counts and sequence size are separate from those heading counts.

State colors are spread across stylesheet selectors and `ACTION_CATEGORIES`. Ready to Merge is green on board surfaces but purple in the tray, while review is indigo on the board and blue in action badges. The tray canvas in `badge.ts` consumes category colors and uses solid backgrounds with white digits. Generic icon blue is not a workflow state color.

The sequence dependency builder enforces owner boundaries. Sequence cards nevertheless expand each step's public members of each Change-Id family without an owner restriction and retain closed steps as context. The summary must count the public open members displayed in those cards, including another owner's branch, while excluding closed and private context.

## Goals / Non-Goals

Goals are to separate individual-change counting from card placement, establish one semantic palette consumed by renderer and tray, and remove only section-heading counts.

Non-goals are changing classification, sequence ownership, card grouping, family branch counts or sequence size, View filtering, other tabs' counting units, tray action eligibility, tray category order, or platform-specific badge behavior. Private changes remain visible in My Changes and retain their existing available actions. This work does not reinterpret private as a new archival state.

## Decisions

### Count My Changes directly from eligible changes

Use the complete classified views before View filters. Resolve each view's displayed card identity with `cardKeys()`. Identify cards that belong to My Changes from its existing section membership, then select all public open views with those card identities. Deduplicate by Gerrit's change identity and aggregate by each member's existing state. Include branches owned by other users when their family or sequence card is displayed in the tab. Merge only the two review modes and keep the agreed fixed order.

Card identities determine which members are displayed; they do not determine the counting unit. Count each qualifying member once even when several members share a card or several sequences reference a family. Do not count unrelated other-owner cards that are available to the app but absent from My Changes. Preserve card placement and ownership rules.

`tabCounts.mine` is the sum of these individual state counts. Other tab entries and board filter-summary card units retain their existing rules.

Alternative rejected: selecting only `isMine` views for the count. That omits other-owner branches visible inside a family and makes the pills disagree with the displayed work.

### Give My Changes an explicit rendering mode

Render its ordered nonzero segments directly, without total-minus-segments arithmetic, a fallback zero, private lock count, or a remainder. Preserve the shared segmented-capsule appearance and normal tab selection. The segments are plain spans, not filter buttons. Keep the existing aggregate capsule hover description, updated to use the six state labels and the eligible public total only. Do not add individual segment titles, visible labels, or a new accessibility interaction pattern; preserve existing tab semantics.

Alternative rejected: adapting all tabs to individual-change rendering. The user explicitly retained the other summaries' rules.

### Centralize semantic workflow colors

Add shared workflow presentation metadata for state-to-color-family mapping and light/dark foreground/background variants plus solid badge colors. Renderer state CSS declarations and action-category colors consume that source rather than maintaining unrelated hex constants. A small shared palette module can expose renderer CSS declarations and solid colors without importing browser APIs into the main process.

Start with existing red, green, indigo, amber, and gray tokens and the tray's purple `#7c3aed` for Ready to Merge. Add theme-appropriate purple foreground/background variants. Solid tray pills keep suitably dark colors with white digits; renderer soft surfaces use the theme variants. Exact shade adjustments are allowed for readability while retaining the agreed hues.

Map Needs Changes to red, Ready to Merge to purple, Approved to green, both review modes to indigo, Iterating to amber, and In Progress to gray. Apply these to state-bearing tab segments, card and ledger borders, badges in rows and sequence pickers, family and sequence member labels, and colored action categories. The Merged tab's pending-merge segment becomes purple, but closed Merged indicators retain their existing styling. The Needs Review pass-around and in-person segments use the review family while preserving their separate counts. Neutral sequence containers and private indicators stay neutral. Generic accent blue, CI/vote colors, avatars, and app icons keep their meanings.

Alternative rejected: reuse generic accent blue for merging. Purple already identifies merge responsibility in the tray, and separating it from indigo with Approved green improves the adjacent pill presentation.

### Remove heading counts at both rendering sites

Remove heading count spans in `Board.tsx` and `Ledger.tsx`. Keep headings, hints, sorting, rows, and family branch counts and sequence size. This applies to every tab, including Private and Sequences. Do not replace them with another counting unit.

### Keep headers free of state totals

Remove the state totals from family headers, sequence headers, and family headers inside sequences. Apply this change to both layouts. Keep each member's state label, the family branch count, the sequence size, and the next-review hint.

### Keep private changes out of sequences

Build sequence chains, candidates, and picker sets from public changes. A private member stops a dependency chain. Ignore old sequence tags on private changes. Do not expand private cherry-picks into sequence cards; show the owner's private branches in Private instead.

The service must read each change before it adds a sequence tag. Reject a private member before any tags are written. Apply this check to both sequence actions and direct hashtag actions. When the user makes a change private, set the private flag and remove its sequence tag. Model rules also keep private changes out when another client changes the flag.

### Validate behavior separately from color rendering

Extend the existing model tests for all six states, zero omission, displayed other-owner members, absent-card exclusions, privacy/closed exclusions, mixed-state sequences, cherry-pick families, and repeated references. Retain regression coverage for other tabs and action-count behavior. Verify shared state/color mapping without screenshot pixel tests.

For visual evidence during implementation, run the application with deterministic fixture data containing all six public states, private changes, closed context, and family/sequence grouping. Capture the same view and scroll position in light and dark mode, with `-light` and `-dark` filenames. Inspect pill readability, numeric widths, borders, and color consistency in standard and compact views. Check all tabs for missing heading counts and retained internal summaries. Use real input to change tabs and apply a View filter; confirm counts remain stable. Use the T3 preview tools first when available. If recording those interactions, use the record-actions skill. State fixture simulation and tested platform; do not claim native macOS tray verification on Linux. Inspect tray render output separately where native tray access is unavailable.

## Risks / Trade-offs

- Color-only identification is less discoverable, especially with zero segments disappearing. Preserve the fixed order and existing accurate aggregate hover information; do not add labels or per-segment tooltips against the agreed design.
- Purple and indigo can look similar. Green separates them in the fixed order; inspect both themes at actual size and adjust shades within their hue families if needed.
- Existing tests and docs assume card counts and private buckets. Update only My Changes expectations and explanatory text; retain regression coverage for the other summaries.
- Broad color selectors can accidentally recolor Merged, generic controls, or votes. Use workflow-specific mappings and audit each state-bearing surface.
- Tray responsibilities and My Changes displayed work can produce different counts. Share color meaning while preserving each summary's eligibility and units.

## Migration Plan

No persisted data, Gerrit tags, or settings require migration. Ship counting, rendering, palette consumers, documentation, and regression coverage together. Rollback restores the previous presentation without data conversion.
