# Design

## Context

See proposal.md for the problem and scope. `ChangeInfo` currently has `submittable` and submit requirements but no mergeability field. `fetchDashboard` reads several queries, filters visible changes, and enriches them with review deltas. `fetchChange` enriches detail reads after user actions. `CiMark` is shared by standard branch rows and the compact ledger and currently returns no glyph when Verified has no vote.

The renderer cache protects detail reads against stale search results. Its fingerprint uses an explicit list of server fields. Branch updates can change mergeability without changing the patch set or change update timestamp, so conflict data must refresh independently of review-data protection.

The existing color and count specs describe workflow states. The warning is separate metadata and does not require changes to those specs.

## Goals / Non-Goals

Goals are one shared indicator layout, an optional mergeability value with a real unknown state, bounded Gerrit reads, and refresh behavior that respects revision and request ordering.

Non-goals are persistent mergeability storage, branch polling outside dashboard refresh, detailed conflict paths, conflict editing, changing submit behavior, or changing review classification. The disabled Ready to Merge action in early mockups is excluded.

## Decisions

### Read mergeability through the current dashboard data path

Add optional `mergeable?: boolean` to shared change data and a typed GET client method for `/changes/{id}/revisions/{revision}/mergeable`. Use an explicit revision SHA when available to bind the response to the revision being displayed. Use the returned query/detail boolean when present; enrich only visible open changes whose value is absent. Deduplicate enrichment by change number and revision within a read and bound its concurrency to six, following the review-delta pattern.

Catch per-change enrichment failures and leave the value absent. Do not infer mergeability from `submittable`, label votes, submit requirements, WIP, or permissions. The same enrichment runs for dashboard and detail reads. Closed changes need no lookup. Do not persist the result in a revision-only cache, since the destination branch can change under an unchanged revision.

This avoids unconditional extra requests on servers that return the field. A search predicate alone would depend on server indexing settings and would not cover detail reads. Gerrit documents both the optional query field and the dedicated endpoint in its [change API](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#get-mergeable).

### Treat mergeability as refresh metadata in the renderer cache

Keep mergeability outside the review-data fingerprint. A mergeability-only change at an equal timestamp must not trigger the cache's equal-timestamp review conflict path. Accept new mergeability, including absence, for the same change and revision when the dashboard ticket is current and its captured generation still matches. Apply that metadata even when the cache keeps protected review fields. Never attach an older revision's result to a newer revision, and do not let superseded tickets or completed writes restore old metadata. Detail reads replace their own mergeability as part of the accepted result.

Add regression checks for branch-only changes, missing values, protected review data, and response ordering. Putting mergeability directly in the fingerprint would treat legitimate branch updates as stale review-index conflicts; omitting it without separate merging could keep old warnings indefinitely.

### Share the patch-set glyph group across both layouts

Extend the existing shared indicator or extract a shared patch-set indicator used by `ChangeRow.tsx` and `Ledger.tsx`. Render an inline SVG triangle only for open changes with `mergeable === false`, followed by the current Verified check or X. Do not make the warning depend on a Verified vote. Keep the patch-set text and glyphs on one line without increasing row height.

Use a 12-pixel outline triangle with an exclamation mark and a small gap before Verified. Use theme tokens with an amber light variant and yellow dark variant; the inspected mockup uses `#a16207` and `#facc15`. Set the warning's hover text and accessible name to `Merge conflict with ${branch}` and hide the SVG paths from assistive technology. Preserve the CI glyph's existing title and colors.

A second X would be hard to distinguish from CI failure. A pill or banner would take more space and was rejected during exploration. The warning is informational and has no click action.

## Risks / Trade-offs

- Servers without query mergeability require extra requests. Bound concurrency, request only visible open changes with absent data, and fail each read independently.
- The query field can reflect Gerrit's indexed state. The warning describes the last accepted read, not a guarantee that submit will succeed; Gerrit remains responsible for submit checks.
- A false mergeability result can include restrictions from the configured submit strategy, not only textual conflicts. The proposed warning follows Gerrit's mergeability result and does not claim specific conflicting files.
- Unknown data removes an earlier warning and does not assert a clean merge. This prevents stale conflict claims; a separate unknown-status icon is outside this change.
- Small glyphs can be difficult to identify. Preserve the triangle shape, theme contrast, hover text, and accessible name, and inspect both layouts in both themes.
- Cache protection can hide fresh branch metadata. Test metadata replacement independently of review-field protection and timestamp changes.

## Migration Plan

There is no stored-data migration or server configuration change. Deploy the optional field and its reader with the renderer together. Reverting this change removes the enrichment and glyph without changing Gerrit data.

Before implementation is accepted, capture paired light/dark screenshots of the real renderer with simulated conflict and CI data in standard and compact views. Show passed CI, failed CI, no CI vote, a family branch, and a sequence member. State the tested platform and simulation. Save distinct filenames, inspect each capture, and include the evidence in the implementation response. This planning change includes refreshed standard-view mockups as visual references, not proof of implemented conflict reads.

Planning references captured and inspected in headless Chromium on Linux with the application's sample dashboard and simulated conflict/CI glyphs:

- [Light mode](mockups/conflict-glyph-proposal-light.png)
- [Dark mode](mockups/conflict-glyph-proposal-dark.png)
