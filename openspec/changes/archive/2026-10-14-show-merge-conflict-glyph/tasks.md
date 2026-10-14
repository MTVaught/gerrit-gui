# Tasks

## 1. Gerrit mergeability reads

- [x] 1.1 Add optional mergeability data and the typed revision mergeability GET to the Gerrit client. Verify request paths, revision binding, true/false values, and error handling with injected-fetch tests.
- [x] 1.2 Enrich visible open changes with absent mergeability in dashboard and detail reads, with per-read deduplication and a concurrency limit of six. Add tests for omitted query fields, independent lookup failures, closed and hidden changes, and query values that need no fallback; verify the focused backend tests pass.
- [x] 1.3 Document query-field support, fallback reads, unknown-data behavior, and branch-dependent freshness in the relevant API comments. Verify the comments match the request tests and make no submit-approval inference.

## 2. Dashboard cache freshness

- [x] 2.1 Accept mergeability refresh metadata independently of the protected review-data fingerprint, tied to the same revision, current ticket, and generation. Extend dashboard-cache tests for branch-only changes at the same timestamp, false-to-true, false-to-unknown, protected review fields, new patch sets, and late responses; verify all cache tests pass.
- [x] 2.2 Update `docs/design/dashboard-cache.md` to explain mergeability metadata replacement. Verify its examples agree with the new cache regressions and preserve existing write protection.

## 3. Shared conflict glyph

- [x] 3.1 Add a shared open-change warning beside patch-set metadata in standard rows and the compact ledger. Use a small triangle before Verified, including when no CI vote exists, with branch-specific hover text and accessible name. Verify rendered checks cover positive, negative, and absent CI votes, unknown/true mergeability, closed changes, and independent family and sequence members.
- [x] 3.2 Add theme tokens and inline sizing for an amber light-mode and yellow dark-mode glyph. Run the real renderer with simulated data and inspect unchanged row heights, one-line icon order, and readable colors in both standard and compact layouts; verify CI colors and workflow colors are unchanged.
- [x] 3.3 Document the glyph and hover text in the dashboard documentation. Verify the description states that the indicator is informational and does not change action availability or counts.

## 4. Integration and visual evidence

- [x] 4.1 Run `pnpm test` and `pnpm typecheck`. Verify all required checks pass and review the diff for changes to classification, counters, sorting, permissions, and actions that are outside this scope.
- [x] 4.2 Exercise an accepted dashboard refresh with an unchanged revision and changed mergeability, plus a failed lookup. Verify the warning updates or disappears while review data and actions remain unchanged.
- [x] 4.3 Capture matching standard and compact screenshots in light and dark modes with simulated passed, failed, and absent CI votes and per-member conflicts. Use distinct filenames with `-light` and `-dark` suffixes, inspect every artifact for readability and icon order, and include the images plus platform and simulation details in the implementation response. Treat any blocked capture as incomplete visual verification.
