# Settings overhaul: five presentations

Three changes, common to all five mockups:

1. **Connection is not a setting.** Server URL, username and HTTP password
   leave the settings page for their own window. Only that window has a Test
   button, and only it reloads the board. It is also the first-run screen.
2. **Settings sits with the tabs.** View, Refresh, Compact and Settings are
   on the tab row itself, not on a second line. Opening settings selects it
   like a tab; clicking any board tab dismisses it. The status text
   ("Alice · updated just now") leaves the row to make room: it becomes the
   Refresh button's tooltip. Below about 1300px the tabs use their short
   labels (To review, Mine, Ready, ...) before anything wraps.
3. **No Save button.** Every control writes on change and the board reacts at
   once (a team change moves changes between tabs, a tray change redraws the
   icon). The designs differ in how they confirm that.

| # | File | Where settings opens | Where connection lives | Feedback |
| --- | --- | --- | --- | --- |
| 1 | `1-gear-tab` | The gear is the last tab of the strip; selected, its label reads "Settings" and the page is a single column, as today minus the connection fields. | A status line at the top of the page with "Change connection…", opening a dialog. | "Saved" flashes beside the control that changed. |
| 2 | `2-sidebar` | Gear icon button, lit while open. The page has a left nav, one entry per section. Compact: the nav becomes a picker row. | The last nav entry, labelled with the account and host; opens a separate OS window. | One "Saved / Saving…" pill in the page header. |
| 3 | `3-drawer` | Gear icon button, lit while open. A 460px drawer slides over the right of the board; the board stays live behind it. Compact: a full-window sheet. | A status line at the top of the drawer; opens a separate OS window. | "Saved" beside the control, and the board itself changing. |
| 4 | `4-account-menu` | Gear icon button; the page is a grid of cards with switches. Compact: one column. | An avatar at the far right of the tab row with a menu: Connection…, Sign out, updates, About. | Switches instead of checkboxes; "Saved" in the card corner. |
| 5 | `5-subtabs` | The gear is the last tab; its page has a second tab row (Team, Mergers, Scope, App icon, Menu bar, Window, About). | A "Connection ↗" launcher at the right of the sub-tab row; opens the sign-in window, which is the first-run screen. | An undo toast at the bottom ("Added dave to the team · Undo"). |

Decision: design 2, section nav. The gear stays an icon button on the tab
row and toggles like a tab: lit while the settings page is open, closed by
any tab click. The page has a left nav with one entry per section (Team,
Mergers, Scope, App icon, Window, Menu bar, About) and, set apart at the
bottom, Connection, labelled with the account and host, which opens a
separate OS window with the server, username, password and the only Test
button. Controls write on change; a "Saved / Saving…" pill in the page header
confirms it. The compact window turns the nav into a picker row.

Each page shows the full window with settings open, the compact window with
settings open, and the connection window. `base.css` is a copy of the app
stylesheet; `mock.css` and `settings.js` hold the mockup-only chrome and the
shared settings sections; `mock.js` (from `filter-sort`) renders the board
behind the drawer in design 3.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> 1350`
