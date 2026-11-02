# Design

## Context

ReviewComments already groups published comments and drafts with commentThreads and filters entire threads by status and author in the All comments dialog. The existing filter row wraps on narrow windows. See proposal.md for motivation.

## Goals / Non-Goals

Keep filtering local to the overview. Reuse existing discussion data, thread grouping, select styling, and review navigation. Do not add server requests, saved preferences, or changes to inline comment visibility.

## Decisions

- Store the selection beside the existing status and author state, defaulting to all. Derive distinct options from all published comments and drafts, sorted numerically newest first. This avoids a separate request and excludes patch sets with no comments.
- Match a thread when any member has the selected saved patch_set. Filter after grouping so replies remain readable. A mapped code location is not a saved patch set and must not affect matching.
- Combine the new predicate with existing predicates and render an explicit empty result message. Do not change the existing status or author semantics.
- Keep selections while the overview closes and reopens, as the existing filters do. Do not persist them across component mounts.

## Risks / Trade-offs

- A thread can span patch sets. Keeping the full thread can show other patch set labels, but preserves the discussion context.
- Three controls can exceed one row. Use existing wrapping styles and verify desktop and narrow layouts in both themes.

## Evidence plan

Run the built Electron renderer on an isolated Linux Xvfb desktop with simulated Gerrit comments on several patch sets, including a draft and a thread spanning patch sets. Use native pointer and keyboard input to select a patch set, combine filters, show an empty result, and restore All patch sets. Record matching light and dark workflows with a visible pointer, two-second hovers, and captions. Capture the same filtered view in both themes. Inspect exported frames and media metadata before sharing.
