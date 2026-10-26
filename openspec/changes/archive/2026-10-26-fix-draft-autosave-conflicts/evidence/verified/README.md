# Fix verification

Tested on Linux/Electron against a fresh local Gerrit 3.11.2 instance with
generated changes and dummy Alice and Bob accounts. The desktop uses its
production entrypoint, preload, IPC, service, and REST client. Both review
windows use Bob's account on the same change. No Gerrit responses or conflict
events are simulated in these recordings.

## Workflow videos

- Single dashboard window and overall review, [light mode](single-window-light.mp4)
  and [dark mode](single-window-dark.mp4), about 72 seconds each.
- Two windows on the same review, [light mode](two-windows-light.mp4)
  and [dark mode](two-windows-dark.mp4), about 104 seconds each.

The single-window sequence creates a file comment, waits for autosave, edits
again, and uses Save on the same ID. It then creates, updates, reopens,
clears, and replaces an overall summary. Keep drafts private retains both
drafts. Publishing stores each once and leaves no private copy.

The two-window sequence creates independent comments in both windows, edits
one shared draft, and shows a genuine conflict in the other editor. Keep as
new draft creates one new ID that accepts further autosaves. A second conflict
uses Load saved version and then saves another edit. Publication from the
left window includes the three source comments and one overall review.
The right window receives the published comments automatically.

The clips use real X11 pointer and keyboard input, visible pointer movement,
two-second hovers, and captions. Keyboard shortcuts are named before use.
Each theme repeats the same workflow, text, framing, and pacing on an equivalent
fresh change. All clips are H.264 at 1920 by 1080, with `yuv420p` and fast-start
metadata. See [media and check results](verification-summary.json).
All four exports decoded at normal playback speed without errors. Their
action/result frames and both screenshot pairs were inspected for pointer
visibility, captions, readability, and the claimed outcomes.

## Stored outcomes and additional checks

- Recorded runs, actual REST requests, stable IDs, and stored comments in
  [light mode](verified-light.json) and [dark mode](verified-dark.json).
- Further real-input checks post a separate overall review from the right
  window after the left window publishes. Both summaries are stored once.
  The [light](additional-window-light.json) and
  [dark](additional-window-dark.json) results include that published comment.
- Line, range, and reply checks exercise successive autosave, Save, Cancel
  restoration, and discard. Delete/publish checks retain text in an open editor
  and reject late updates and deletes. These run outside the clips and are
  included in the stored results above.
- The existing real-server reply regression also passes in
  [light mode](reply-anchor-light.json) and [dark mode](reply-anchor-dark.json).
  It verifies the original patch-set anchor and one reply in Gerrit's actual
  web thread.

Final draft storage on each tested change is empty after publication. The recorded changes are
36 and 37 in light mode, and 39 and 42 in dark mode. The additional checks use
changes 38 and 40, then 41 and 43. All data belongs to the throwaway instance.

## Static outcome pairs

- Published source comment and overall review,
  [light mode](published-result-light.png) and [dark mode](published-result-dark.png).
- Published review shown in both windows,
  [light mode](multiwindow-result-light.png) and [dark mode](multiwindow-result-dark.png).

Each pair shows the same final change, data, viewport, and scroll position.
The screenshots were captured after recording, with only the theme changed.

## Automated checks and limits

All 374 unit tests, typecheck, build, the full comment fixture workflow, and
the production-IPC review-window workflow pass. Deterministic fixture cases
also check changed content within one stored timestamp second. The fixtures
model the different save/read precision and reject invalid overall REST
payloads.

The temporary app, recorders, displays, and Gerrit instance were stopped.
Native macOS and Windows were not tested. Existing duplicate drafts are kept
for manual inspection. The earlier defect evidence remains in
[the investigation](../../../../../../docs/investigations/draft-autosave-conflict.md).
