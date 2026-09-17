# Tray menu: picking a change from the drop-down

Today the tray icon's menu has one row per category ("Needs Review: 3") that
opens the board on that tab, and a click on the icon also raises the board
window. These mockups do two things:

- The click opens the menu only. The board stays where it was (it is drawn
  faded in the background of every page). In `src/main/tray.ts` this is the
  `tray.on('click', () => handlers.show())` handler; with a context menu set,
  macOS pops the menu and fires the click, so the window comes forward too.
  Dropping the handler leaves the "Open board" row as the way in.
- Each category expands to the changes in it, and a change opens in Gerrit.

All five show the same data for Alice: three cards need her review (two
single changes and one Change-Id family from Bob on three branches, one of
which she already voted on), one family needs changes, one family is
approved, and Dave asked her to merge one change. The pills read 3 1 1 1 because a family counts once, as on the tabs.

| # | File | Container | Expand a section | A family |
| --- | --- | --- | --- | --- |
| 1 | `1-submenu-per-branch` | Native menu | Hover the row; a submenu | One row per branch, subject repeated |
| 2 | `2-submenu-nested-family` | Native menu | Hover the row; a submenu | One row, with a third-level submenu of branches |
| 3 | `3-inline-accordion` | Native menu | Click the row; the menu rebuilds and reopens with the rows inline | A label line plus an indented line per branch |
| 4 | `4-popover-sections` | Frameless popover window | Click the header; the section opens in place | A card with a line per branch, as on the board |
| 5 | `5-popover-chips` | Frameless popover window | Every section starts open; header collapses it | One line with a chip per branch |

In every design a branch that does not need the action (already voted,
still out for review) is listed greyed, so the family reads whole, and the
count of rows in a section matches its pill except in design 1.

Trade-offs:

- Designs 1 to 3 are a change to the menu template only: Electron menus
  give submenus and rebuilds for free, and the menu keeps the look of the
  other menu-bar menus. They cannot show colour or two-line rows, so the
  branch and owner go in grey after the subject.
- Design 1 is the least code. Its rows do not match the pill count, and a
  family's branches are told apart only by the grey suffix.
- Design 2 matches the counts and keeps a family together, at the price of a
  three-level menu.
- Design 3 keeps everything one level deep, but the click-to-toggle closes
  the native menu and the app pops it up again, which may flicker, and the
  menu can get long.
- Designs 4 and 5 need a second BrowserWindow: positioned under the icon,
  closed on blur and Escape, with its own renderer. In return they get
  real disclosure, colour, two-line rows and the family card from the board.
- Design 4 is the closest to the board. Design 5 is the shortest panel and
  needs no expand step to reach a change, at the cost of small chip targets.

Design 2 was built.

`gen.mjs` writes the five pages; `mock.css` draws the menu bar, the menu
and the popover.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> 1000`
