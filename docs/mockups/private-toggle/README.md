# Private toggle mockups

The owner's row on My Changes has one subtle button, "Mark WIP" / "Mark
active (runs CI)". These mockups add a way to flip Gerrit's private flag
from the same row. Each page shows three ordinary changes and one private
one; the first row has its control open.

| File                       | Idea                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `1-dropdown.html`          | The button gains a caret; its menu lists the WIP and visibility toggles. |
| `2-split-button.html`      | Main part toggles WIP in one click; the caret's menu holds Make private. |
| `3-two-buttons.html`       | A second subtle button, Make private / Make public, next to the first.   |
| `4-clickable-badges.html`  | WIP/Active and Public/Private badges are the toggles; no button column.  |
| `5-kebab-menu.html`        | A "⋯" button opens a checklist: Work in progress, Private, then more.    |

`gen.mjs` writes the five pages from one template; `base.css` is a copy of
the app stylesheet; `mock.css` holds the static menus, tooltip and caption.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> [width]`
