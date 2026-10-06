# Inline comment comparison

Investigated on 2026-10-06 against Gerrit's public review UI and current comment
components. Application observations come from the native comment UI fixture
and the renderer implementation. Published threads were inspected live; draft
behavior was checked against Gerrit's source because the public session is signed
out. No live comments were written.

## Findings before the fix

| Case | Gerrit | Application before the fix | Proposed change |
| --- | --- | --- | --- |
| Single published comment | Author belongs in the clickable comment header; body expansion is per comment. Inline file/line metadata is normally omitted. | A separate line/status header sits above the author, timestamp and body. Expansion is for the entire thread. | Use an author-led comment header and avoid another location row where the code already supplies the location. |
| Resolved or older messages in a chain | Resolved threads initially collapse their published messages. Collapsed headers retain the author and a text preview. Each message can be expanded independently. | Every thread starts expanded. Collapsing hides all authors and messages, leaving only location and resolution state. | Collapse resolved published messages by default, retain previews, and support independent message expansion. Keep unresolved discussions and drafts accessible. |
| Comment from an earlier patch set | Eligible threads can be carried forward to mapped locations, with a link identifying their original patch set. | Only comments matching one of the two selected revisions are placed inline. Other threads require All comments and switching revision. | Load Gerrit's ported comments and drafts for the comparison. Clearly identify original patch sets instead of treating historical line numbers as current positions. |
| Saved draft | A Draft label distinguishes private text. Drafts have Edit/Discard actions; thread reply actions are suppressed when a draft is present at the end. | Your draft and a colored border identify saved drafts, but the common thread footer still offers Done/Ack/Resolve actions. | Keep draft-specific actions and suppress competing thread reply controls while composing or displaying the pending draft. |
| Draft being edited | Uses a Resolved checkbox and Save/Cancel. Cancel restores the values from when editing started and saves the restored draft. Privacy guidance is available as a tooltip. | Uses an Unresolved checkbox and Save/Close editor. Closing retains autosaved edits. Full anchor metadata and two explanatory lines add height. | Match checkbox wording, define real Cancel behavior, and shorten repeated metadata/help. Continue saving meaningful draft state to Gerrit. |
| Thread with replies | One group of thread reply actions follows the conversation. Individual message headers retain their own identity and expansion. Ack/Done are conditional on an unresolved thread. | Every published message has Reply/More, followed by another Done/Ack/Resolve footer. Done/Ack also appear on resolved threads. | Consolidate ordinary reply actions into a single thread footer and show resolution-related actions only when appropriate. Keep message-specific operations available. |

## Implemented

Published messages now have individual author headers and expansion controls.
Resolved threads initially show message previews; unresolved threads and drafts
remain expanded. Collapsing comments does not collapse code.

Ordinary Reply and Quote actions appear once per thread as direct link-style
controls, followed by a copy-link icon. Comment and thread More menus have been
removed. Administrator deletion uses an icon in an expanded comment header.
Clicking an author header also toggles expansion, with the chevron on the right. Ack and Done appear
only on unresolved threads and immediately save resolved reply drafts to Gerrit. Pending draft replies suppress competing thread
actions. Resolution changes use the draft Resolved checkbox; there are no separate
Resolve/Unresolve actions. Saved drafts have a Resolved checkbox, Edit and Discard; editors use
Save and Cancel with privacy guidance in the Draft tooltip.

Cancel restores the server draft's message, resolution state and suggestions
from when editing started. Canceling a new autosaved draft deletes it from
Gerrit. Failed writes retain the editor and surface the error.

The app fetches revision-scoped `ported_comments` and `ported_drafts` alongside
change-wide discussion data. Mapping is cached per comparison; file changes
and scrolling do not fetch mapping or source content again. Eligible older
comments appear at server-provided locations with a From PS link. Original
write anchors remain separate: editing an older draft retains its original
revision, path and range, while replying uses the displayed revision and
location. Unmapped historical threads remain accessible through All comments.

Gerrit decides which comments are eligible for porting. A mapping failure is
shown with Retry while ordinary comments remain usable. Pretend mode skips
private drafts.

## Comment colors

Light mode matches Gerrit's resolved gray `#e8eaed` and unresolved pale yellow
`#fef7e0`. Dark mode uses Gerrit's brighter gray `#3c3f43` and amber `#614a19`
to separate the cards from the code surface. Borders, links and secondary text
have theme-specific contrast. Thread color follows the latest reply's resolution
state and switches immediately when an embedded draft's Resolved checkbox changes.

## Validation

Unit tests cover display mapping, selected-revision precedence, range/side
handling, API endpoints for both compared revisions, and private draft exclusion
in pretend mode. Native Electron interactions cover independent expansion,
compact resolved threads, draft cancellation and failure recovery, mapped
replies, original draft write coordinates, inline placement, keyboard navigation,
and source-file request counts. Screenshots use in-memory Gerrit fixtures in
both light and dark mode.

## References

- [Published thread inspected live](https://gerrit-review.googlesource.com/c/gerrit/+/351075/18/java/com/google/gerrit/server/change/ValidationOptionsUtil.java)
- [Gerrit comment component](https://gerrit.googlesource.com/gerrit/+/master/polygerrit-ui/app/elements/shared/gr-comment/gr-comment.ts)
- [Gerrit thread component](https://gerrit.googlesource.com/gerrit/+/master/polygerrit-ui/app/elements/shared/gr-comment-thread/gr-comment-thread.ts)
- [Ported comment API](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#list-ported-comments)
- [Ported draft API](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html#list-ported-drafts)
- Application: `ReviewComments.tsx`, `review-comments.ts`, `service.ts` and
  `test/review-comments-ui.cjs`.

## Additional review parity work

Comments now use CommonMark rendering, per-author and resolution filters, and
server-provided context snippets in All comments. Author headers show avatars
or initials, hover details, and relative timestamps with exact-time tooltips.
Hovering or focusing a thread highlights its code range. Administrative deletion
uses a modal dialog. Structured and fenced suggestions show a server-generated
diff preview before creating a change edit.

Reply combines summary drafts, vote buttons, editable draft links, reviewer/CC
changes, attention-set adjustments and notification choices. The summary uses
the same serialized Gerrit draft autosave as inline comments. Clearing it removes
the server draft. Gerrit reviewer errors are shown even on HTTP 200 responses.

The compact file list includes status, additions/deletions, comment indicators
and merge-list files. Account diff preferences sync with Gerrit while fit to
screen stays local. First use keeps the requested Whole file default. Metadata
polling every 30 seconds updates comments and patch-set choices while preserving
the selected comparison and full-file cache. Explicit refresh also invalidates
historical comment positions.

Blame uses Gerrit's revision/file API and caches results with the full file.
Commit ranges can be opened and inspected in the diff gutter. The local outline
is a bounded declaration-pattern index, rather than semantic analysis. Binary
files and semantic symbol hovers continue to open in Gerrit.

- [Review inputs and fix previews](https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html)
- [Account diff preferences](https://gerrit-review.googlesource.com/Documentation/rest-api-accounts.html#get-diff-preferences)
- [Current Gerrit shortcut bindings](https://gerrit.googlesource.com/gerrit/+/master/polygerrit-ui/app/services/shortcuts/shortcuts-config.ts)
