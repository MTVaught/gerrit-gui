# Add reviewer mockups

The "+" on a row adds a reviewer. Today it opens a search box only. These
mockups put the team list from Settings a click away, while the search still
adds anyone on the server. The owner chooses Primary or Other; anyone else
adds primary reviewers only, so the mode control disappears for them.

| File                          | Idea                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `1-inline-team-chips.html`    | Same inline box; a row of team chips above the search field.         |
| `2-popover-checklist.html`    | Popover like the merger picker; team as checkboxes, batch add.       |
| `3-typeahead-sections.html`   | One search field; dropdown opens on focus with Team, then Gerrit.    |
| `4-role-buttons.html`         | Popover; every row has a Primary and an Other button, no mode radio. |
| `5-toggle-chips.html`         | Popover; team as toggle chips, search adds chips, one Add button.    |

`base.css` is a copy of the app stylesheet; `mock.css` holds the static
stand-ins for the popover and dropdown.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> [width]`
