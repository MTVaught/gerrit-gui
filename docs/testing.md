# UI checks without a display

To make a screenshot of one tab under Xvfb, run:

```sh
GERRIT_GUI_USER_DATA=/tmp/gg-bob GERRIT_GUI_TAB=mine GERRIT_GUI_SCREENSHOT=/tmp/mine.png \
  xvfb-run -a ./node_modules/.bin/electron --no-sandbox .
```

- `GERRIT_GUI_USER_DATA` is a separate profile directory, so the test user does not touch your settings.
- `GERRIT_GUI_TAB` selects the tab. Use `needs-my-review`, `reviewing`, `mine`, `ready-to-merge` or `merged`.
- `GERRIT_GUI_SCREENSHOT` is the output path. The application waits 3 seconds after load (set `GERRIT_GUI_SCREENSHOT_DELAY` in ms to change this), writes the PNG and stops.

Seed a test server first with `./test/seed-gerrit.sh` (refer to the "Tests" section of `README.md`).
