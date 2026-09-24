# UI checks without a display

To make a screenshot of one tab under Xvfb, run:

```sh
GERRIT_GUI_USER_DATA=/tmp/gg-bob GERRIT_GUI_TAB=mine GERRIT_GUI_SCREENSHOT=/tmp/mine.png \
  xvfb-run -a ./node_modules/.bin/electron --no-sandbox .
```

- `GERRIT_GUI_USER_DATA` is a separate profile directory, so the test user does not touch your settings.
- `GERRIT_GUI_TAB` selects the tab. Use `needs-my-review`, `reviewing`, `mine`, `merged`, `team-reviews` or `external-reviews`. Use `settings` to open the settings page instead of a tab, or `connection` to show the connection form in the main window. The `team-reviews` tab is only there when `settings.json` in the profile directory names a `primaryTeam`, and `external-reviews` only when `teams` has one or more entries. The `external-reviews` tab is All Reviews, showing everyone outside the team; append `&team=<name>` to pick a team, or `&team=-` for Other: `GERRIT_GUI_TAB='external-reviews&team=Storage'`.
- `GERRIT_GUI_SCREENSHOT_JS` is optional JavaScript that runs in the page before the capture, for example `document.querySelector('.ledger .t').click()` to open the first ledger row.
- `GERRIT_GUI_SCREENSHOT` is the output path. The application waits 3 seconds after load (set `GERRIT_GUI_SCREENSHOT_DELAY` in ms to change this), writes the PNG and stops.

Seed a test server first with `./test/seed-gerrit.sh` (refer to the "Tests" section of `README.md`).

`docs/walkthrough/shoot.sh` uses the same hooks to make the screenshots in `docs/walkthrough.md`. It needs an empty Gerrit on its own port, seeds four users and one project, then takes one change through the workflow and captures the window of each person at each step. `settings.json` in a profile directory can hold `mergers`, a list of `{ "project": "platform/*", "people": ["dave"] }` rows, to fill the Ready to Merge picker, and `teams`, a list of `{ "name": "Platform", "members": ["alice", "bob"] }` rows, with `primaryTeam` naming one of them.

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
