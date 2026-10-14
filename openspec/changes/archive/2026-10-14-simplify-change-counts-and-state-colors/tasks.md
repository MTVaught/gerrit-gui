# Tasks

## 1. Individual My Changes counts

- [x] 1.1 Implement the six ordered My Changes state counts from distinct public open changes displayed in the unfiltered tab, including other owners' family and sequence members in `src/shared/model.ts`, independent of card grouping; verify model tests cover all six states and combine only the two review modes.
- [x] 1.2 Update existing My Changes expectations and add meaningful regressions for mixed-state sequences, cherry-pick families, private members, closed context, another owner's family member, shared references, and all-zero results; verify `node --test src/shared/model.test.ts` passes while other tab and action-count expectations retain their existing units and eligibility.
- [x] 1.3 Give My Changes explicit numeric segment rendering in `App.tsx`, omitting zero segments and all private/sequence/remainder/total indicators; verify all-zero, private-only, and mixed-state fixtures show the expected segments without a fallback zero. Keep the existing aggregate tooltip accurate and add no individual segment tooltips or filter actions.
- [x] 1.4 Update the README's My Changes count explanation to describe individual public changes and whole-tab scope; verify examples agree with grouped-family and private-change model results.

## 2. Shared workflow colors

- [x] 2.1 Introduce shared state presentation metadata for red, purple, green, indigo, amber, and gray, including renderer theme variants and readable solid tray colors; verify the state-to-family mapping and action-category color relationships with focused tests and document the mapping in the README.
- [x] 2.2 Apply the shared colors to tab state segments, card and compact-ledger state borders/badges, family and sequence member state labels, and sequence-picker badges; verify Ready to Merge is purple, review is indigo, and Iterating is amber across those surfaces while closed-state, generic control, avatar, vote, and CI colors remain unchanged.
- [x] 2.3 Connect `ACTION_CATEGORIES` and the tray canvas consumers to the shared workflow colors without changing category order, units, eligibility, zero settings, or platform behavior; verify existing action and badge tests plus rendered solid-pill contrast in both tray appearances.

## 3. Section heading presentation

- [x] 3.1 Remove section count spans from `Board.tsx` and `Ledger.tsx` for every tab, retaining titles, hints, and family branch counts and sequence size; verify standard and compact views contain no section-heading counts while content totals remain visible.
- [x] 3.2 Update current user documentation that describes section counts, where present; verify it describes the resulting heading presentation without changing unrelated historical design documents or mockup records.

## 4. Integrated verification and evidence

- [x] 4.1 Run `pnpm test`, `pnpm typecheck`, and `pnpm build`; resolve failures caused by the changes and record the outcome.
- [x] 4.2 Run the application with deterministic fixtures containing all six public states, private and closed context, sequences, and cherry-picks. Use real input to select tabs, change View filters, and switch compact mode; verify pills remain stable under filters, have no filtering behavior, and section headings omit counts on all tabs.
- [x] 4.3 Capture and inspect paired application screenshots with `-light` and `-dark` suffixes for the same data, framing, and scroll positions in standard and compact views. Include all six pill colors, grouped member indicators, missing section counts, and member state labels; inspect readability at actual UI size and narrow widths. If videos are used for interaction proof, follow the record-actions skill with comparable paired workflows.
- [x] 4.4 Capture the rendered tray strip for color comparison and verify its numbers still follow action responsibilities rather than My Changes displayed membership. Report the tested platform, fixture simulation, and any native tray or visual-capture limitations; link inspected light/dark artifacts in the implementation handoff.

## 5. Remove repeated state totals

- [x] 5.1 Remove state totals from family and sequence headers in standard and compact views, including families inside sequences. Keep member state labels, branch counts, sequence size, and the next-review hint. Update the specs and README. Verify rendered headers have no state totals.
- [x] 5.2 Keep private changes out of sequence chains, cards, candidate sets, and picker lists. Reject private members in sequence and hashtag writes. Remove the sequence tag when a change is made private. Add model and service tests for these rules. Make #104 public in the sample and verify Approved 3 for #104, #106, and #108.
- [x] 5.3 Run the tests, type check, and build. Capture and inspect new light and dark screenshots in both layouts. Use the UI checks to verify the counts and member state labels.
