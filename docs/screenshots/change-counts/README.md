# Change count verification

These images show the real renderer on Linux with simulated Gerrit data.
Each light and dark pair uses the same data, size, and scroll position.
All pairs were inspected for text, color, and layout.

| View | Light | Dark |
| --- | --- | --- |
| Standard, 1560 px | [Light](mine-standard-light.png) | [Dark](mine-standard-dark.png) |
| Compact, 680 px | [Light](mine-compact-light.png) | [Dark](mine-compact-dark.png) |
| Narrow compact, 560 px | [Light](mine-narrow-light.png) | [Dark](mine-narrow-dark.png) |
| Private change outside sequence | [Light](private-outside-sequence-light.png) | [Dark](private-outside-sequence-dark.png) |
| Rendered tray strip | [Light](tray-strip-light.png) | [Dark](tray-strip-dark.png) |

My Changes shows these counts in order:

| State | Count | Color |
| --- | --- | --- |
| Needs changes | 1 | Red |
| Ready to merge | 1 | Purple |
| Approved | 3 | Green |
| In review | 2 | Indigo |
| Iterating | 1 | Amber |
| In progress | 2 | Gray |

Changes #104, #106, and #108 are public and approved. Each adds one to the
green pill. The family includes another owner's branch, #108. It counts too.
The Private section contains #112, which adds nothing. Closed changes also
add nothing. Both review modes add to In review.

Family and sequence headers have no state totals. The headers keep the branch
count and sequence size. Each member keeps its state label. Private changes
cannot join a sequence. The model and service tests check old tags, private
cherry-picks, picker lists, tag writes, and the change to private status.
The private-change image pair uses a separate test case. In that case, #104
has the private flag and an old sequence tag. It appears in Private, not in
the sequence or its picker. Its Approved count is excluded.

The input checks used Electron mouse events to select all six tabs in both
layouts, click a count segment, open View, enter a search, clear the filter,
and switch to compact mode. The counts stayed the same under the search.
No segment applied a filter. No section heading had a count. Separate fixture
runs checked private-only, empty, and In progress-only data.

The tray image comes from the application's canvas output. Its counts are
1 review, 1 fix, 3 approved, and 1 merge. The tray retains its action rules,
including eligible private work. It does not use My Changes displayed-member counts.
Solid tray colors meet a 4.5:1 contrast ratio with white digits.

Native macOS tray display was not tested. The collaborative browser could not
connect to the local test server. Electron under Xvfb was used for capture.

The compact ledger has an existing action-control overflow of 10 px at a
560 px viewport. The same measurement with the original stylesheet was also
570 px of content. The count pills fit within the viewport. This change does
not modify the action controls.

## Repeat the checks

Start Vite in one terminal:

```sh
pnpm exec vite --config vite.web.config.ts --host 127.0.0.1
```

Run the input and image checks in another terminal:

```sh
xvfb-run -a -s '-screen 0 1920x1440x24' node_modules/.bin/electron --no-sandbox test/count-summary-ui.cjs
```

The unit tests, type check, and production build passed:

```sh
pnpm test       # 231 tests passed
pnpm typecheck
pnpm build
```
