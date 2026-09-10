# UI checks without a display

To make a screenshot of one tab under Xvfb, run:

```sh
GERRIT_GUI_USER_DATA=/tmp/gg-bob GERRIT_GUI_TAB=mine GERRIT_GUI_SCREENSHOT=/tmp/mine.png \
  xvfb-run -a ./node_modules/.bin/electron --no-sandbox .
```

- `GERRIT_GUI_USER_DATA` is a separate profile directory, so the test user does not touch your settings.
- `GERRIT_GUI_TAB` selects the tab. Use `needs-my-review`, `reviewing`, `mine`, `ready-to-merge`, `merged` or `external-reviews`. Use `settings` to open the settings panel instead of a tab. The `external-reviews` tab is only there when `settings.json` in the profile directory has one or more entries in `team`.
- `GERRIT_GUI_SCREENSHOT_JS` is optional JavaScript that runs in the page before the capture, for example `document.querySelector('.ledger .t').click()` to open the first ledger row.
- `GERRIT_GUI_SCREENSHOT` is the output path. The application waits 3 seconds after load (set `GERRIT_GUI_SCREENSHOT_DELAY` in ms to change this), writes the PNG and stops.

Seed a test server first with `./test/seed-gerrit.sh` (refer to the "Tests" section of `README.md`).

## Update flow

Updates are off when the application runs from the source tree. To exercise the check, download and restart flow in `pnpm dev`, set `GERRIT_GUI_DEV_UPDATE=1`. The updater then reads `dev-app-update.yml` (the GitHub repository to poll) in place of the metadata a packaged application carries. The download step needs a packaged application, and on macOS a signed one, so in `pnpm dev` it ends with an error in the banner. The check and the prompt work.
