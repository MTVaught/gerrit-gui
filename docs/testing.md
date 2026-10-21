# UI checks without a display

To make a screenshot of one tab under Xvfb, run:

```sh
GERRIT_GUI_USER_DATA=/tmp/gg-bob GERRIT_GUI_TAB=mine GERRIT_GUI_SCREENSHOT=/tmp/mine.png \
  xvfb-run -a ./node_modules/.bin/electron --no-sandbox .
```

- `GERRIT_GUI_USER_DATA` is a separate profile directory, so the test user does not touch your settings.
- `GERRIT_GUI_TAB` selects the tab. Use `needs-my-review`, `reviewing`, `mine`, `merged`, `team-reviews` or `external-reviews`. Use `settings` to open the settings page instead of a tab, or `connection` to show the connection form in the main window. The `team-reviews` tab (the team tab) is only there when `settings.json` in the profile directory has a watched team or a `primaryTeam`, and `external-reviews` only with a `primaryTeam`. Append `&team=<name>` to pick a watched team on the team tab, or `&team=-` for all of them: `GERRIT_GUI_TAB='team-reviews&team=Storage'`.
- `GERRIT_GUI_SCREENSHOT_JS` is optional JavaScript that runs in the page before the capture, for example `document.querySelector('.ledger .t').click()` to open the first ledger row.
- `GERRIT_GUI_SCREENSHOT` is the output path. The application waits 3 seconds after load (set `GERRIT_GUI_SCREENSHOT_DELAY` in ms to change this), writes the PNG and stops.

Seed a test server first with `./test/seed-gerrit.sh` (refer to the "Tests" section of `README.md`).

`docs/walkthrough/shoot.sh` uses the same hooks to make the screenshots in `docs/walkthrough.md`. It needs an empty Gerrit on its own port, seeds four users and one project, then takes one change through the workflow and captures the window of each person at each step. `settings.json` in a profile directory can hold `mergers`, a list of `{ "project": "platform/*", "people": ["dave"] }` rows, to fill the Ready to Merge picker, and `teams`, a list of `{ "name": "Platform", "members": ["alice", "bob"], "watched": true }` rows, with `primaryTeam` naming one of them.

## Gerrit transport security

`pnpm test` includes URL, settings, and transport checks with dummy credentials.
The transport test uses OpenSSL to create a temporary certificate. It checks
that an untrusted certificate fails, a trusted HTTPS request works, and HTTP
downgrade redirects never reach the HTTP listener. It needs `openssl` on PATH.

Credential binding tests cover browser settings and both desktop storage modes.
They check that loopback HTTP can reuse a password only for the same origin
and account when the local test flag is enabled. Remote HTTP is rejected even
with a replacement password. Invalid stored or startup environment URLs remain
visible for correction, but cannot supply credentials to the transport.

For a local Gerrit HTTP fixture, use `http://127.0.0.1:8080` and start the
application or integration test with `GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1`.
This exception is for dummy accounts only. It does not permit remote HTTP.

To check the real desktop connection form and capture the results, run:

```sh
pnpm build
xvfb-run -a node_modules/.bin/electron --no-sandbox test/transport-ui.cjs
```

This test needs `openssl`, `xdotool`, and Xvfb. It uses an isolated profile,
dummy credentials, and a local HTTPS server with a simulated Gerrit account
response. It trusts only the temporary fixture certificate within the test
session. It uses real mouse and keyboard input to submit the connection form.
It checks that remote HTTP cannot save settings or call fetch, that HTTPS
connects, and that Chromium rejects five HTTP downgrade redirects. Old desktop
HTTP settings must also fail before fetch. The HTTP listener must receive zero
requests. `--no-sandbox` is for this Xvfb test only.

The harness also checks that changing the origin clears the typed password and
disables submission. It enters the dummy password again for the HTTPS origin.

The Linux/Electron captures are in `docs/screenshots/transport-security/`.
`remote-http-blocked-light.png` and `remote-http-blocked-dark.png` show the
rejection. `https-connected-light.png` and `https-connected-dark.png` show
the successful HTTPS result. Each pair uses the same view, data, and scroll
position. These captures do not use a live Gerrit installation.

## Mockups and web pages

`docs/mockups/shot.cjs` renders an HTML mockup to PNG under Xvfb. It also
takes a URL, for a screenshot of the Gerrit web UI; `SHOT_LOGIN` is a URL
to load first, for a session, and `SHOT_DELAY` waits (ms) before the capture:

```sh
SHOT_LOGIN='http://localhost:8080/login/%23%2F?account_id=1000001' SHOT_DELAY=4000 \
  xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs 'http://localhost:8080/c/demo/+/3' out.png 1180
```

## Credential identity checks

`pnpm test` checks both settings stores with dummy passwords and temporary
settings files. The desktop checks replace Electron's keychain functions
with reversible dummy encryption. They check origin and account changes,
blank-password rejection, unchanged settings after rejection, replacement
credentials, safe reuse and browser environment overrides. A request recorder
checks the destination and Authorization header used by the real service.

To check the connection form with real input on Linux:

```sh
pnpm build
xvfb-run -a node_modules/.bin/electron --no-sandbox test/credential-binding-ui.cjs
```

This check uses the built renderer and the production browser settings store
and service. Gerrit responses are simulated. All passwords are dummy values,
and all settings and browser profiles use temporary directories. The check
confirms that origin and account changes disable submission, an identity
change clears a typed password, and the new identity receives only the
replacement password. Paired light/dark captures are saved under
`docs/screenshots/credential-binding/` for the blocked and connected states.

## Update flow

Updates are off when the application runs from the source tree. To exercise the check, download and restart flow in `pnpm dev`, set `GERRIT_GUI_DEV_UPDATE=1`. The updater then reads `dev-app-update.yml` (the GitHub repository to poll) in place of the metadata a packaged application carries. The download step needs a packaged application, and on macOS a signed one, so in `pnpm dev` it ends with an error, shown in the top bar button's tooltip and in Settings. The check and the top bar button work.

## Local review editor

The dashboard cache regression runs against independently controlled search
and detail responses, with no Gerrit server or saved credentials. It checks
that one re-request stays in Pass Around through stale searches, then accepts
an external vote. It runs the same view and data in light and dark mode:

```sh
pnpm build
xvfb-run -a node_modules/.bin/electron --no-sandbox test/dashboard-cache-ui.cjs
```

Build the app and run the Electron interaction test with synthetic 100k-line
files. It needs no Gerrit server or saved credentials:

```sh
pnpm build
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-ui.cjs
```

The test sends wheel, scrollbar drag and keyboard input to the packaged
renderer. It checks synchronized scrolling, whole-file navigation, the search
widget, real mouse clicks through an overlapping search-control tooltip,
Gerrit navigation shortcuts, safe typing, shortcut-help focus, background
scroll locking, file caching, bounded rendered lines and worker loading under
the CSP. Fit-to-screen checks also bound alignment spacer elements, not only
visible text lines. The pinned Monaco package has a patch to skip zero-height
alignment zones for wrapped unchanged lines and preserve original-model inline
decorations in unified deleted-code blocks. Keep the patch and the provider
adapter in sync when upgrading Monaco. It also checks preferences save/cancel, font size and tab rendering,
optional context limits, local whitespace comparison, both patch-set selectors,
comparison caching, manual reviewed flags and automatic marking. Sidebar checks cover independent
status toggles, progress, filtering, compact rows, full-path tooltips, and resizing
with mouse and keyboard. Unit tests
cover all whitespace modes and source-column mapping; API tests verify reviewed
flag endpoints and prevent writes in pretend mode.
Set `REVIEW_SCREENSHOTS=1` to refresh `docs/screenshots/local-review/`.
The sandbox flag is for the Xvfb test harness only.

Rebase coloring has a separate small mixed-edit fixture:

```sh
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-rebase-ui.cjs
```

It checks ordinary edits keep their colors, Gerrit's `due_to_rebase` edits use
separate colors in both diff modes, whitespace-only edits follow preferences,
dark mode remains readable, and no additional source requests are made. It also
checks the compact header leaves space for code and Escape closes its menus
without closing the review. It
captures `docs/screenshots/local-review/rebase-diff-light.png` and
`rebase-diff-dark.png`.


The comment interaction test uses the same large-file fixture:

```sh
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-comments-ui.cjs
```

It checks unchanged-line and selected-range comments, base-side anchors, server
draft restoration after reopening, editing and discarding, replies and resolution,
overall review drafts, label votes while keeping drafts private, explicit publishing,
and stored suggested fix preservation/application. It also exercises save failure and retry,
and typing while a draft creation request is in flight. Comment operations must
not refetch source files or render the complete file into the DOM. The fixture is
an in-memory Gerrit API substitute; these tests do not publish to a live server.
Inline checks verify default placement beneath code, expanding and collapsing
threads, alignment of both panes, real mouse focus in the draft textarea,
resizing, and moving base-side threads between side-by-side and unified views.
The baseline scroller test starts without comment fixtures; the comment test
enables its own published-thread fixture before launching the renderer.
Screenshots are written as light/dark pairs for `inline-review-comments`,
`inline-review-draft` and `publish-review`.

The comment test also covers CommonMark rendering, author/resolution filters,
summary autosave and deletion when cleared, reviewer and attention-set payloads,
fix previews, Blame, the declaration outline and 30-second update polling.
Incoming metadata must preserve the complete-file cache. The native fixture
keeps the 100,000-line files virtualized throughout these operations. Screenshot
pairs include `publish-review`, `inline-review-comments`, `inline-review-draft`
and `suggested-fix-preview`, each with `-light` and `-dark` suffixes.

New comment selections exclude a final newline from the saved range. A selection
ending at the start of the next line attaches to the preceding source line.
Selecting only a newline creates a line comment. Existing drafts, replies, and
supplied replacement ranges keep their stored coordinates. A new suggested
replacement uses the adjusted range and leaves the source newline in place.

The full comment test also runs the selection boundary checks. To run those
checks alone after building:

```sh
xvfb-run -a -s '-screen 0 1600x1100x24' \
  node_modules/.bin/electron --no-sandbox test/review-selection-ui.cjs
```

This uses real editor input with simulated Gerrit responses. It checks the
shortcut and context menu, forward and reverse selections, both split panes,
an older base patch set, unified code, wrapped lines, autosave, Save, reopen,
stored ranges, and suggestions. Unit tests cover blank lines, tabs, Unicode,
CRLF source columns, and the final newline at the end of a file.

Draft screenshots also assert that the textarea is visible and receives pointer
hit testing in both themes. Inline comment zones retain their measured height
while Monaco hides them offscreen, and editors reveal before receiving focus.

## Replies to older comments

Reply, Quote, Ack, and Done keep the parent comment's original patch set,
file path, side, merge parent, line, and range when they save a draft. Server
mapping places the composer and draft in the current comparison. Autosave,
Save, editing, Cancel, and discard keep the same draft ID and saved anchor.

Publish all drafts includes replies saved on older patch sets. Publish drafts
on selected patch set excludes them, and Keep drafts private leaves them
private. The publish list and count follow the selected scope.

Build first, then run the focused simulated-server workflow:

```sh
pnpm build
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-ported-reply-ui.cjs
```

The full `test/review-comments-ui.cjs` workflow also runs these checks. They
cover older renamed files, parent-side ranges and merge parents, cross-file
replies from All comments, creation while typing, failed-save retry, draft
identity, cancel restoration, discard, reopen, and all three publication
scopes. The fixture rejects updates and deletes sent to the wrong patch set.

For the real-server regression, start a throwaway Gerrit 3.11.2 on loopback
and seed it with `test/seed-gerrit.sh`, as described in the investigation.
Then run:

```sh
GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1 xvfb-run -a -s '-screen 0 1440x1000x24' \
  node_modules/.bin/electron --no-sandbox test/review-ported-reply-gerrit.cjs
```

This uses the production desktop entrypoint, preload, service, and REST
client. Xdotool supplies real mouse and keyboard input. The test creates
changes using dummy Alice and Bob accounts, opens an older comment on patch
set 3, saves and publishes one reply, and checks the actual REST writes and
Gerrit web thread data. The reply must belong to patch set 2 at its original
line and appear once in Gerrit's patch-set-3 web diff. No private copy remains.
Both themes run with isolated app settings. Linux/Electron is the tested
platform; the sandbox flag applies only to the Xvfb test.

Set `REPLY_RECORDINGS=1` to capture paired MP4s with captions, visible pointer
movement, and two-second hovers. Set `REPLY_EVIDENCE_DIR` to choose the output
directory. The test prints the temporary output path by default and writes
paired JSON evidence plus screenshots of the same final change and view.

`test/reproduce-ported-reply.ts` remains an API diagnostic for the pre-fix
payload, with `--original-anchor` as its control. Its default deliberately
sends the faulty mapped anchor. Use the renderer regression above to verify
the application fix.

## Dashboard icon tooltips

Dashboard status icons and icon controls show help after a short hover delay,
or immediately on keyboard focus. Press Escape to close help and keep focus.
The tooltip stays open when the pointer moves into it. Text wraps inside the
window in light and dark themes.

Help covers merge conflicts, CI results, sequence steps, related branches,
unresolved comment threads, private status, reviewer controls, toolbar controls,
and split-menu controls in standard cards and the compact ledger. A CI check
means CI checks passed for the stated patch set. A sequence check identifies
the step's review state. A red CI X means CI checks failed. The conflict warning
names the destination branch. Help does not change any workflow state or action.

Start the fixture server in one terminal:

```sh
pnpm exec vite --config vite.web.config.ts --host 127.0.0.1
```

Then run the tooltip checks and existing conflict regression check:

```sh
xvfb-run -a -s '-screen 0 1560x1100x24' node_modules/.bin/electron --no-sandbox test/dashboard-tooltips-ui.cjs
xvfb-run -a node_modules/.bin/electron --no-sandbox test/merge-conflict-ui.cjs
```

The Linux fixture harness uses Xvfb and xdotool for real pointer and keyboard
input. It loads the real renderer with simulated Gerrit data and an isolated
user-data directory. The sandbox flag applies only to this test harness.
The checks cover hover, Tab focus, accessible descriptions, Escape dismissal,
pointer travel into help, viewport bounds, unchanged trigger dimensions,
current vote and branch text after refresh, removal on view changes, and
retained control actions. Screenshots go to
`docs/screenshots/dashboard-tooltips/` as matched light and dark pairs.

To record the same hover, focus, and dismissal sequence in both layouts and
both themes, run this command with FFmpeg installed:

```sh
TOOLTIP_RECORDINGS=1 xvfb-run -a -s '-screen 0 1560x1100x24' node_modules/.bin/electron --no-sandbox test/dashboard-tooltips-ui.cjs
```

The videos include the pointer and action captions. They go to
`docs/videos/dashboard-tooltips/` with `-light` and `-dark` filename suffixes.
This workflow verifies Linux Electron behavior. It does not contact Gerrit or
verify native Windows or macOS behavior.
