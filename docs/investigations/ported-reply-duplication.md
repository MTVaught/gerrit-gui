# Duplicate display of replies to older comments

Reproduced on Gerrit 3.11.2 on 2026-10-21, using application commit
`67f9c7d4d1aa9e2617b591bf06fe0e3a695c6e09`.

The built-in review tool saves a reply at the comment's displayed position on
the newer patch set. It keeps `in_reply_to` from the older patch set. Gerrit
stores one reply, but its web interface shows that reply both as a separate
thread and inside the older thread on the same line. Both displayed copies
have the same comment ID.

The reporter confirmed Gerrit 3.11.2 and an original comment on an older
patch set. The reproduction uses a real local Gerrit container, dummy users,
and generated source files. No production Gerrit or reporter data was used.
The desktop workflow uses the built application, its production preload,
service, and REST client. Xdotool supplies mouse and keyboard input on Linux
under Xvfb. This investigation does not change application behavior.

## UI reproduction

1. Publish a comment on `reply.ts:1` in patch set 2.
2. Publish patch set 3 with an added line above that code. Gerrit maps the old
   comment to line 2.
3. Open patch set 3 in the built-in review tool, with Base selected as the
   comparison base. Open `reply.ts`.
4. Click Reply in the thread marked `From PS 2`. Type one message, wait for
   autosave, then click Save.
5. Click the top Reply button and Send review. One draft is listed.
6. Open patch set 3 of the same file in Gerrit's web interface. The reply
   appears twice on line 2.

The screenshots use the same change, data, view, and scroll position. The
videos repeat the workflow with equivalent fresh changes in each theme.
Each video lasts about 34 seconds and includes captions, the pointer, and
two-second hovers before clicks.

| Evidence | Light | Dark |
| --- | --- | --- |
| Workflow video | [Light](ported-reply-duplication/reproduction-light.mp4) | [Dark](ported-reply-duplication/reproduction-dark.mp4) |
| Gerrit result | [Light](ported-reply-duplication/result-light.png) | [Dark](ported-reply-duplication/result-dark.png) |
| Actual writes and stored comments | [Light](ported-reply-duplication/requests-and-storage-light.json) | [Dark](ported-reply-duplication/requests-and-storage-dark.json) |
| Gerrit web thread data | [Light](ported-reply-duplication/web-threads-light.json) | [Dark](ported-reply-duplication/web-threads-dark.json) |

In the light workflow, the original ID is `909f3891_761b8d53` on patch set 2,
line 1. The reply ID is `26a6d480_7bbea41c` on patch set 3, line 2. The REST
response contains one original and one reply. The web thread data contains
the reply ID once as its own thread root and again in the original thread.
Autosave creates one draft, Save updates that ID, and publishing leaves no
private draft.

## Cause and control

`src/renderer/src/components/ReviewComments.tsx:75` uses `replyAnchor()` when
it opens a reply. At lines 138–139, that function prefers the mapped display
anchor. At lines 111–114, `save()` sends that mapped patch set, path, side,
line, and range together with the original parent ID. Ack and Done use the
same anchor function at lines 191–193.

For this case, the request is `PUT /changes/29/revisions/3/drafts` with
`line: 2` and `in_reply_to: "909f3891_761b8d53"`. That parent belongs to patch
set 2, line 1. The built-in thread grouping follows parent IDs across patch
sets, so the app itself shows one thread and hides the web display problem.

Saving the reply on patch set 2, line 1, while publishing from patch set 3
with `PUBLISH_ALL_REVISIONS` produces one web thread. The
[control thread data](ported-reply-duplication/control-web-threads.json)
records that result. Same-patch-set replies also produced one thread.

Gerrit 3.11.2's own
[createNewReply implementation](https://gerrit.googlesource.com/gerrit/+/refs/tags/v3.11.2/polygerrit-ui/app/utils/comment-util.ts#200)
copies the original comment's patch set, path, side, line, range, and parent.
The proposed fix is to preserve that original anchor for writes and use
mapped coordinates only for display. Reply, Quote, Ack, and Done need that
rule. Existing draft edits must keep their own saved anchors.

The current simulated UI test at `test/review-comments-ui.cjs:182` expects a
ported reply to use patch set 3 and the mapped coordinates. That assertion
encodes the faulty behavior. The fixture groups all comments by parent ID
and cannot expose Gerrit's duplicate web rendering. A fix should update
that assertion and retain a real Gerrit check.

## Repeat the API reproduction

Use a throwaway Gerrit with the repository's seeded `demo` project and dummy
`alice` and `bob` accounts. The commands create and publish test changes.

```sh
docker run -d --rm --name gerrit-reply-repro \
  -p 127.0.0.1:8080:8080 gerritcodereview/gerrit:3.11.2
GERRIT_URL=http://127.0.0.1:8080 ./test/seed-gerrit.sh
GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1 node test/reproduce-ported-reply.ts
GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP=1 node test/reproduce-ported-reply.ts --original-anchor
docker stop gerrit-reply-repro
```

The script uses the production REST client for draft creation, update, and
publication. It prints the Gerrit URL, request bodies, and stored comment
IDs. Set `GERRIT_REPRO_OUTPUT` to save that JSON. The default case uses the
faulty mapped anchor; `--original-anchor` provides the control. It checks
storage, not the browser DOM. Open each printed URL to compare web results.

Validation completed: both API cases, both desktop recordings and web
results, ten focused comment/client tests, `pnpm build`, and `pnpm typecheck`.
Capture and test processes were temporary. Native Windows and macOS were
not tested.

## Fix verification

The fix keeps the immediate parent comment's original anchor for Reply,
Quote, Ack, and Done. Display placement uses the server mapping, or the
known parent thread while a new draft ID has no mapping. The composer,
Save, and editing from the publish list keep the active comparison open.
Draft edits, cancel restoration, and deletion use the saved draft's anchor.
Previously saved or published comments are not relocated.

The renderer-driven regression in `test/review-ported-reply-gerrit.cjs`
passed on real local Gerrit 3.11.2 in light and dark mode. Xdotool supplied
the input to the production desktop app. The test then inspected the real
Gerrit web diff. Data was generated with dummy Alice and Bob accounts on
Linux/Electron. No reporter data was used.

In the recorded light case, autosave created one draft at patch set 2,
line 1. Save updated the same ID. The app
kept patch set 3 open and published that ID with `PUBLISH_ALL_REVISIONS`.
Gerrit stored one reply, left no private draft, and displayed that reply
once inside the original thread on its patch-set-3 web diff. The dark case
passed the same checks. The linked JSON records the change and comment IDs
from each run.

- Light workflow: [Video](ported-reply-duplication/fixed/fixed-reply-light.mp4), [requests and web thread data](ported-reply-duplication/fixed/fixed-reply-light.json).
- Dark workflow: [Video](ported-reply-duplication/fixed/fixed-reply-dark.mp4), [requests and web thread data](ported-reply-duplication/fixed/fixed-reply-dark.json).
- Matching final screenshots of the same change: [Light](ported-reply-duplication/fixed/fixed-result-light.png), [Dark](ported-reply-duplication/fixed/fixed-result-dark.png).

Both videos were decoded at their normal playback rate and inspected at the
input, Save, publication, and final-result stages. They are about 27 seconds
long, with readable captions, a visible pointer, and two-second hovers before
clicks. Both screenshot versions were inspected for readability and layout.
The earlier reproduction captures above remain the before evidence.

The focused simulated-server checks cover all response actions, renamed
files, parent-side ranges and merge parents, cross-file replies from All
comments, saving while typing, failure and retry, draft ID reuse, edit and
cancel restoration, discard, reopen, and all publication scopes. See
`docs/testing.md` for the commands. The API diagnostic still deliberately
sends the old faulty payload by default; it does not test the current app.
