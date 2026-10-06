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

## Mockups and web pages

`docs/mockups/shot.cjs` renders an HTML mockup to PNG under Xvfb. It also
takes a URL, for a screenshot of the Gerrit web UI; `SHOT_LOGIN` is a URL
to load first, for a session, and `SHOT_DELAY` waits (ms) before the capture:

```sh
SHOT_LOGIN='http://localhost:8080/login/%23%2F?account_id=1000001' SHOT_DELAY=4000 \
  xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs 'http://localhost:8080/c/demo/+/3' out.png 1180
```

## Update flow

Updates are off when the application runs from the source tree. To exercise the check, download and restart flow in `pnpm dev`, set `GERRIT_GUI_DEV_UPDATE=1`. The updater then reads `dev-app-update.yml` (the GitHub repository to poll) in place of the metadata a packaged application carries. The download step needs a packaged application, and on macOS a signed one, so in `pnpm dev` it ends with an error, shown in the top bar button's tooltip and in Settings. The check and the top bar button work.

## Local review editor

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
alignment zones for wrapped unchanged lines. Keep the patch and the provider
adapter in sync when upgrading Monaco. It also checks preferences save/cancel, font size and tab rendering,
optional context limits, local whitespace comparison, both patch-set selectors,
comparison caching, manual reviewed flags and automatic marking. Sidebar checks cover independent
status toggles, progress, filtering, compact rows, full-path tooltips, and resizing
with mouse and keyboard. Unit tests
cover all whitespace modes and source-column mapping; API tests verify reviewed
flag endpoints and prevent writes in pretend mode.
Set `REVIEW_SCREENSHOTS=1` to refresh `docs/screenshots/local-review/`.
The sandbox flag is for the Xvfb test harness only.


The comment interaction test uses the same large-file fixture:

```sh
xvfb-run -a node_modules/.bin/electron --no-sandbox test/review-comments-ui.cjs
```

It checks unchanged-line and selected-range comments, base-side anchors, server
draft restoration after reopening, editing and discarding, replies and resolution,
overall review drafts, label votes while keeping drafts private, explicit publishing,
and suggested fix creation/application. It also exercises save failure and retry,
and typing while a draft creation request is in flight. Comment operations must
not refetch source files or render the complete file into the DOM. The fixture is
an in-memory Gerrit API substitute; these tests do not publish to a live server.
Inline checks verify default placement beneath code, expanding and collapsing
threads, alignment of both panes, real mouse focus in the draft textarea,
resizing, and moving base-side threads between side-by-side and unified views.
The baseline scroller test starts without comment fixtures; the comment test
enables its own published-thread fixture before launching the renderer.
Screenshots are written to `inline-review-comments.png`, `inline-review-draft.png`
and `publish-review.png`.
