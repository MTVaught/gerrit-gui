# Draft autosave reports a conflict with its own write

Reproduced on 2026-10-26 at application commit
`ce1e4e2943f68d88f0cc2f93bb5288509a6977af`, against real local Gerrit 3.11.2.
One dashboard window was open, with the review embedded in it. No Gerrit
browser window or second app instance was open. Tests used generated data
and dummy Alice and Bob accounts on Linux/Electron under Xvfb.

This investigation adds diagnostic scripts and evidence. It does not change
application behavior.

## False draft conflict

Gerrit returns different timestamp precision for the same saved draft.
For example, the line-comment case returned:

```text
PUT draft response updated: 2026-10-26 14:13:53.072000000
GET drafts response updated: 2026-10-26 14:13:53.000000000
```

The ID, message, resolution state, and source position are unchanged.
`draftVersion()` in `src/shared/draft-version.ts:3` includes the raw
`updated` string. The two versions therefore compare unequal.

The full sequence is:

1. Autosave creates the draft in Gerrit.
2. `ReviewComments.save()` at line 166 sets the editor's expected version
   from the PUT response, which retains milliseconds.
3. The desktop mutation emits `app:reviewChanged` to matching views,
   including the window that made the save. The handler at lines 106-110
   schedules a discussion refresh after 25 ms.
4. The refresh reads the persisted draft with whole-second precision.
   The comparison at lines 94-96 marks this as a conflict when no save is
   pending. Autosave pauses and Save is disabled.
5. Keep as new draft clears the editor's ID and version. Autosave creates
   another draft. Its own refresh causes the same false conflict. The old
   draft remains, so two IDs now contain the same text.

The main-process check in `src/main/index.ts:176` also uses
`requireDraftVersion()`. It can reject an update or deletion with the PUT
version even before the renderer handles a refresh. This is not a failure
to save the first draft, and it does not require another writer.

The API diagnostic reproduced this mismatch for line, file, range, and
reply drafts. A valid overall draft without `side` has the same mismatch.
For all five cases, replacing only the PUT timestamp with the GET timestamp
makes the current fingerprints equal. Using the freshly read version also
passes the current version guard. The raw responses and these controls are
in [api-comparison.json](draft-autosave-conflict/api-comparison.json).

The raw timestamp fingerprint and immediate desktop notifications were
introduced in `4feb336`, Open reviews in separate windows, on 2026-10-23.
They also apply when separate review windows are disabled.

## Separate Reply summary failure

Typing an overall summary in the top Reply dialog fails with:

```text
PUT /changes/<id>/revisions/2/drafts: 400 patchset-level comments can't have side, range, or line
```

`ReviewComments.review()` at line 129 creates the overall anchor with
`path: '/PATCHSET_LEVEL'` and `side: 'REVISION'`. The save code at lines
159-162 forwards that side to Gerrit. Gerrit rejects it. The text remains
in the editor, the status says the draft could not save, and Send review
stays disabled. No summary draft is stored.

The API diagnostic confirms that the same kind of summary saves when
`side` is omitted. This problem predates the draft version check. The
summary anchor with `side` dates to `9af98864` on 2026-10-06.

The reporter did not supply the text of their second error. This is a
confirmed failure in the reported Reply-summary workflow; its exact match
to their second error remains unconfirmed.

## UI reproduction and evidence

1. Open a review in the dashboard and select a source file.
2. Open Comments, then File comment. Type a message and wait for autosave.
3. Observe the conflict warning and disabled Save button. Gerrit stores
   one draft despite the warning.
4. Click Keep as new draft. The warning returns and Gerrit stores two
   distinct drafts with identical text.
5. Click Cancel in the draft editor. Open the top Reply dialog.
6. Type a review summary and wait. Observe the HTTP 400 error and disabled
   Send review button.

The videos show this full sequence with real X11 mouse and keyboard input,
a visible pointer, two-second hovers before clicks, captions, and pauses on
the results. Light and dark runs use equivalent fresh changes, one window,
the same text, and the same framing. All server responses are from Gerrit;
no comment data or conflict events are simulated.

- [Light workflow](draft-autosave-conflict/reproduction-light.mp4)
- [Dark workflow](draft-autosave-conflict/reproduction-dark.mp4)
- Actual requests and stored drafts in [light mode](draft-autosave-conflict/requests-and-storage-light.json)
  and [dark mode](draft-autosave-conflict/requests-and-storage-dark.json)
- Conflict screenshots in [light mode](draft-autosave-conflict/draft-conflict-light.png)
  and [dark mode](draft-autosave-conflict/draft-conflict-dark.png)
- Summary error screenshots in [light mode](draft-autosave-conflict/summary-error-light.png)
  and [dark mode](draft-autosave-conflict/summary-error-dark.png)

Each screenshot pair uses the same change, data, view, and scroll position.
The conflict screenshots show an additional edit of an existing saved
draft, which also conflicts with its own update. The videos show the new
draft and Keep as new draft sequence. Native macOS and Windows were not tested.
Both screenshot pairs and the video action/result frames were inspected.
Each video is about 41 seconds, encoded as H.264 with a visible pointer.
The temporary app, recorder, display, and Gerrit container were stopped.

## Why existing tests pass

The simulated server in `test/fixtures/review-windows-server.cjs` returns the
same `updated` string for PUT and GET. It does not model Gerrit's persisted
timestamp truncation. It also accepts patch-set-level drafts with `side`.
The preload fixture in `test/fixtures/local-review-preload.cjs` returns the
same saved object for both operations. Neither exposes these server rules.

The nine focused client and mutation tests, `pnpm build`, and
`pnpm typecheck` pass on the affected code. The real-server diagnostics
assert the faulty outcomes so they can reproduce this investigation;
they are not passing regression tests for a future fix.

## Proposed correction

Use a consistent saved-draft version for PUT and GET responses. Normalize
timestamp precision or obtain the persisted version after a write. Keep
the content and position checks so real concurrent edits still conflict.
Check this with the app's own mutation notification and with a second window
that makes a real conflicting edit.

For `/PATCHSET_LEVEL`, omit `side`, `line`, and `range` from the REST draft
payload. Add server-accurate fixtures and real-server checks for summary
creation, subsequent edits, clearing, and publication.

## Repeat the investigation

These commands reproduce the defects on the pre-fix commit shown above.
For the corrected code, use the real-server regression in `docs/testing.md`.

Use a new throwaway container. The seed script creates test accounts,
projects, and changes. The diagnostics create more test changes and drafts.

```sh
docker run -d --rm --name gerrit-draft-repro \
  -p 127.0.0.1:18080:8080 gerritcodereview/gerrit:3.11.2
GERRIT_URL=http://127.0.0.1:18080 bash test/seed-gerrit.sh
GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1 \
  DRAFT_REPRO_OUTPUT=/tmp/draft-api-comparison.json \
  node test/reproduce-draft-autosave.ts
pnpm build
GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1 \
  DRAFT_EVIDENCE_DIR=/tmp/draft-autosave-evidence \
  xvfb-run -a -s '-screen 0 1440x1000x24' \
  node_modules/.bin/electron --no-sandbox test/reproduce-draft-autosave-ui.cjs
docker stop gerrit-draft-repro
```

Set `GERRIT_TEST_URL` on either diagnostic to select another throwaway
loopback server. The default is `http://127.0.0.1:18080`. The sandbox flag
is limited to the isolated Electron test, as in the repository's existing
headless test workflow. All profiles and recordings use separate test paths.

T3 browser capture was unavailable because `preview_open` returned
`This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+)`.
The repository's Electron/Xvfb workflow supplied the real-input evidence.

## Fix implementation

The shared draft version function now compares recognized Gerrit timestamps
at whole-second precision. It keeps all other version fields and the original
display timestamp. Both the renderer and the desktop mutation guard use this
function. Unknown timestamp formats stay unchanged. Real changed content
still conflicts within the same stored second.

Overall draft serialization now removes `side`, `line`, `range`, and `parent`
only for `/PATCHSET_LEVEL`. Source comment and reply payloads retain their
original anchors. No extra read is required after a save.

After updating, reopen the review or restart the app to clear any old expected
version and paused editor state. Existing duplicate drafts remain available
for manual inspection and deletion.

The comment fixture and production-IPC window workflows pass with separate
fractional save and whole-second persisted read responses. The HTTP fixture
rejects invalid overall payloads. Checks include genuine same-second edits,
stale updates and deletes, deletion and publication while another editor is
open, both recovery choices, and successive saves on one recovered ID.

## Fix verification

The corrected app passes the real-server regression on a fresh Gerrit 3.11.2
instance in both themes. Xdotool supplies input to the production Linux
desktop app. Line, file, range, and reply drafts retain their IDs through
successive saves. Overall summaries autosave, reopen, clear, stay private,
and publish without invalid source-position fields.

Two windows on the same review can save independent comments. Editing the
same saved draft produces a real conflict, retains local text, and supports
both recovery choices. The recovered new draft accepts further saves without
extra copies. Separate overall reviews posted from the left and right windows
are each stored once. Deletion and publication still reject stale updates
and deletes, and final private draft storage is empty.

The [verification evidence](../../openspec/changes/fix-draft-autosave-conflicts/evidence/verified/README.md)
contains paired videos, outcome screenshots, actual requests, and stored IDs.
The two video pairs cover the single-window summary lifecycle and two-window
comment/conflict/publication workflow. Additional recorded request data covers
posting an overall review from the other window and source comment lifecycle
checks. All data is generated with dummy accounts. Native macOS and Windows
were not tested.

All 374 unit tests, typecheck, build, the full comment fixture and production-IPC
window workflows, and the existing real-server reply-anchor/web-thread check
pass. The temporary Gerrit container and capture processes were stopped.
