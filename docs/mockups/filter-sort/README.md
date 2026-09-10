# Search, filter and sort: five presentations

Every board tab gets three controls: a text search over the subject, a filter
by author, and a sort with three orders. The sort today has two of them
(most recent update, overall age); the third is new.

| Sort | Key | Where it comes from |
| --- | --- | --- |
| Most recent update | `change.updated`, newest first | already used |
| Overall age, oldest first | `change.created` | already used |
| Last patch set, oldest first | `revisions[current_revision].created` | fetched already (`CURRENT_REVISION`), not yet in `ChangeView` |

All five mockups show the same data: Bob's "Reviewing" tab with nine changes
by Alice (5), Dave (2), Erin from another team (1) and Frank (1). Each page has
the full window on top and the compact window below. The rows come from
`mock.js`; the chrome of each design is in its own file.

| # | File | Full window | Compact window |
| --- | --- | --- | --- |
| 1 | `1-filter-bar` | A row of form controls under the tabs: search field, Author select, Sort select, match count, Clear. | Sort stays in the toolbar; search and Author form a third header row. |
| 2 | `2-query-box` | One Gerrit-style query box in the top bar. Words search titles; `owner:` and `sort:` are tokens with a suggestion list. Replaces the sort select. | The box takes the toolbar row next to the icons; a one-line summary shows the match count. No extra row. |
| 3 | `3-column-headers` | Table semantics: a header row per section; Opened, Patch set and Updated are sortable. Owner names are links whose menu filters to or hides that author. Search behind a magnifier icon. | The ledger's Change header names the sort and opens the sort menu; the magnifier in the header row expands into a search field; tapping an owner filters. |
| 4 | `4-view-menu` | One View button with a badge opens a panel: search, author checkboxes with counts, sort radios. A summary strip with removable chips appears only while something is active. | Same button; the panel spans the window. Least space of the five. |
| 4b | `4b-view-menu-authors` | Design 4 with three author pickers that scale to thousands of accounts: A type-ahead with Me / My team / Outside team shortcuts, B a capped ranked list with a find field, C picking from the owner's name on a card. | Variant A; the suggestion list scrolls inside the panel. |
| 5 | `5-facet-sidebar` | A left column with search, author facets with counts and sort radios. | A bottom sheet behind a filter button: author chips, segmented sort control, Done. |

Decision: design 4 with author picker A. One View button in the top bar
opens a panel with a title search field, an author type-ahead (owners on the
current tab with counts first, then any Gerrit account through the existing
account suggestion endpoint) with Me / My team / Outside team shortcut chips,
and the three sort orders. A summary strip with removable chips appears only
while something is active. The compact window uses the same button and a
full-width panel.

Common to all five:

- The age cell follows the sort key: "20m ago" under Most recent update,
  "opened 9d ago" under Overall age, "PS 5 pushed 3d ago" under Last patch
  set. The compact sub-line does the same in short form.
- Filters narrow rows inside each section; sections with no match disappear,
  and the section counts show the matches. The tab counts keep the totals.
- Search highlights the matched text in the subject.
- The author list is built from the owners on the current tab, so it never
  offers a name that would match nothing.
- Search and filter are per session; the sort is remembered as today.

Render: `xvfb-run -a ./node_modules/.bin/electron --no-sandbox docs/mockups/shot.cjs <in.html> <out.png> [width]`
