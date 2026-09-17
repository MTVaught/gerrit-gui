# Gerrit Review Board

Gerrit Review Board is a desktop application for Gerrit 3.11. It shows code
review as a workflow with a request and a response. The author asks for a
review of one patch set. Each primary reviewer votes on that patch set. The
result is set after the last primary reviewer votes.

The application shows three things:

- The changes that you must review
- The changes that you review
- The status of your changes

All users get the same five tabs. Two more tabs, "Team Reviews" and
"External Reviews", appear when you set a team in the settings (refer to
"Teams" below). The owner of a change, checked against that team list,
decides where it is listed: changes owned by the team are on the five tabs
and on "Team Reviews", changes owned by anyone else are on "External Reviews"
only. The "View"
button in the top bar (or Ctrl+F) opens the search, filter and sort for every
tab: a search over the subjects, an author filter, and the row order. The
author field suggests the owners of the changes on the current tab first,
then any Gerrit account; "Me" picks your own changes without typing. The
rows can be ordered by the most recent update (default), by overall age with
the oldest change first, or by the age of the current patch set with the
oldest first. The age shown on each row follows the chosen order. The
application remembers the sort; the search and filter last for the session.

| Tab | Contents |
| --- | --- |
| Needs Review | The author asked for a review of the current patch set. You are a primary reviewer. You did not vote on that patch set. The WIP status has no effect. |
| Reviewing | All open changes on which you are a reviewer, primary or not, in groups by state. |
| My Changes | Your open changes, in groups by state, with the actions of the owner. The count gains a red segment for changes that need work and a green one for approved changes. Private changes are in one section at the bottom, whatever their state. Your own are the only private changes the application shows: a private change of another author is never listed, even when you are a reviewer or CC on it. |
| Merged | Approved changes that the author asked you, by name, to merge, above the changes that Gerrit merged in the last 14 days. The count gains a green segment while anything waits on you to merge. |
| Team Reviews | Every open change owned by someone else on your team, in groups by state, whether or not you review it. Only with a team. |
| External Reviews | Open changes owned by someone outside your team, in groups by state. Only with a team. These changes are on no other tab. |

![Needs Review](docs/screenshots/needs-my-review.png)

## The workflow

1. The author pushes a change and adds primary reviewers with the "+"
   button on the row. It opens a checklist of the team from Settings; anyone
   else on the server can be searched for and joins the list. One button adds
   everyone checked. With "Primary" selected, the application adds each one
   as a reviewer in Gerrit, if needed, and tags the change
   `reviewer:<username>`. The primary reviewers are the people whose votes
   decide. Anyone else on the change, added in Gerrit, by CI or with the
   "Other" choice of the same button, is shown but not waited for. If the author pushes more patch sets, the state does not
   change. The application does not ask a reviewer to look at the change yet.
2. When the patch set is ready, the author pushes the "Request review" button.
   The button is off until the change has a primary reviewer. All primary
   reviewers then see the change on the "Needs Review" tab.
3. Each primary reviewer pushes the "Review" button. It opens the change in Gerrit,
   showing the diff from the last patch set that reviewer looked at to the
   current one (or the whole change on a first look). The reviewer votes +1
   or -1 in Gerrit. After a reviewer votes, the application removes the change
   from the "Needs Review" tab of that reviewer.
4. After the last primary reviewer votes, the change gets the "Approved"
   state (all votes are +1) or the "Needs Changes" state (one or more votes
   are -1). Votes that come before the last vote do not change the state.
   The votes of the other reviewers never change the state.
5. If the state is "Needs Changes", the author pushes the corrections and
   pushes the "Request review" button again. The application asks all
   reviewers again, for the new patch set only. If the change still has the
   `ready-to-merge` hashtag from an earlier patch set, the button also removes
   the hashtag. The application does not remove the hashtag on its own. The
   `reviewer:` tags stay: the same people are asked again.
6. If the state is "Approved", the change is Active (not WIP) and CI voted
   Verified +1 on the current patch set, the author pushes the "Ready to
   Merge" button and picks the person to merge: one of the mergers set for the project in
   "Settings", or anyone else on the server. The change then shows
   "Ready to Merge · Dave" on "My Changes".
7. The person who was asked sees the change at the top of the "Merged" tab,
   in the tray count, and in a desktop notification. That person opens the
   change in Gerrit, votes +2 and submits it there; the application has no
   merge button. Nobody else is asked; if the merger cannot merge, the author
   picks someone else with "Change merger".

Refer to `docs/walkthrough.md` for the same flow with a screenshot of each
step, from the developer's, a reviewer's and the merger's window.

The WIP status is not part of this workflow. A change can go through the full
workflow with the WIP status. The application shows WIP or Active as a
separate badge with a separate switch. This is useful if you use WIP to stop
CI until the review is complete. The "Ready to Merge" button does not remove
the WIP status; it is disabled until the change is Active and Verified +1, so
the merger is only asked once CI has passed.

## How the states are related to Gerrit data

The application has no database. The application calculates each state from
data that Gerrit already has. Thus, a user who looks at Gerrit directly sees
the same votes, hashtags and WIP flags.

| Workflow item | Gerrit data |
| --- | --- |
| Request review | The application writes the number of the current patch set to the custom keyed value `review-requested-ps` of the change. |
| Primary reviewer X | The change has the hashtag `reviewer:<username>`, with the Gerrit username of X in lower case, or the email address for an account with no username. One tag per primary reviewer. |
| Needs Review by X | The number in `review-requested-ps` is the same as the number of the current patch set. X is a primary reviewer. X has no Code-Review vote on the current patch set. |
| Reviewer finished | X has a Code-Review vote (+1 or -1) on the current patch set. |
| "+" button, "Primary" | For each person checked: adds them as a reviewer of the change in Gerrit, when they are not one yet, then adds the `reviewer:` tag. One account per tag; a group is refused. |
| "×" on a primary reviewer | Removes the `reviewer:` tag, then tries to remove the reviewer in Gerrit. Gerrit lets only the owner, an administrator or the person themself do the second part; for anyone else the tag goes and the person stays on the change as an other reviewer. |
| "↑" and "↓" on a reviewer | Adds or removes the `reviewer:` tag only. The person stays on the change in Gerrit. |
| Review button | Opens Gerrit at `/c/<project>/+/<change>/<last>..<current>`, where `<last>` is the highest patch set with a vote or reply from you in the change messages. Without one, it opens the current patch set against base. The caret offers the other diffs and the change page. |
| Needs Changes | All primary reviewers voted on the current patch set. One or more of them voted -1. |
| Approved | All primary reviewers voted +1 on the current patch set. There is at least one primary reviewer. |
| Ready to Merge | The state is Approved, the change has the hashtag `ready-to-merge`, and the custom value `ready-to-merge-ps` equals the current patch set number. A tag for an earlier patch set (or without the value, from an older version) is shown as stale and the change stays Approved. |
| Ready to Merge button | Enabled when the state is Approved, the change is not WIP, and the `Verified` label has a +1 (or higher) vote and no negative vote on the current patch set. The application adds the hashtags `ready-to-merge` and `merger:<username>` in one request, then sets the custom value `ready-to-merge-ps` to the current patch set number. The username is the Gerrit username of the person asked, in lower case; the email address for an account with no username. A change has one `merger:` tag; "Change merger" replaces it. |
| Asked of you | The change is Ready to Merge and the `merger:` tag names your username or email address. |
| Tagged without a merger | The change is Ready to Merge and has no `merger:` tag. Only an older version of the application makes this. Every user with +2 sees it. |
| Merge | Done in the Gerrit web UI: the merger votes +2 and submits there. The application only lists the change. |

These rules have these effects:

- When a user pushes a new patch set, Gerrit removes the votes that are not
  sticky. The number in `review-requested-ps` is then different from the
  number of the current patch set. Thus, a new push puts the change back in
  the "In Progress" state. The application does not ask a reviewer. A trivial
  rebase keeps the copied votes. Thus, an approved change stays approved after
  a trivial rebase.
- A +2 vote does not count for the "Approved" state. Gerrit has no query that
  tells if a user can submit a change before the change is submittable. The
  application cannot warn the author that the person picked has no +2; the
  person asked finds out in Gerrit.
- The merger is not added as a reviewer or CC. Gerrit itself sends the merger
  nothing. The application is the notification channel, so a merger who does
  not run the application learns of the request from the author.
- "Re-request review" and "Clear ready-to-merge" remove the `merger:` tag
  together with the `ready-to-merge` tag.
- Only the owner of the change or an administrator can write custom keyed
  values. Thus, a reviewer cannot request a review for a different user.
- Anyone may add or remove a `reviewer:` tag, if Gerrit lets them edit
  hashtags. Gerrit grants "Edit Hashtags" to the owner and administrators
  only by default. Grant it to "Registered Users" on the project, or on
  `All-Projects`, so that reviewers can tag each other. `test/seed-gerrit.sh`
  shows the REST call.
- A `reviewer:` tag for a person who is not a reviewer of the change in
  Gerrit still counts. The application shows the person with a dotted
  outline and waits for their vote, and the person sees the change on their
  own board. This happens when someone removes the reviewer in Gerrit but
  not the tag, or writes the tag by hand.
- A change with reviewers but no `reviewer:` tag has nobody to decide. It
  stays in "Needs Review" after a request, and the "Request review" button
  is off until a primary reviewer is tagged. Changes made before this
  version have no tags: tag the reviewers, with "↑" on each chip.
- The application does not use the attention set.
- Bots and the owner do not count as reviewers, tagged or not. Bots are the
  members of the Gerrit "Service Users" group.
- The Gerrit `reviewer:` search operator does not find WIP changes. Thus,
  the application also scans the open WIP changes of other owners and keeps
  the changes on which you are a reviewer. On a large server, set a project
  scope in "Settings" to keep this scan small. If Gerrit truncates a result,
  the application shows a warning.

## One change on several branches

A cherry-pick to another branch is a separate change in Gerrit. It keeps the
Change-Id of the original commit. The application shows the changes that
have the same Change-Id as one card. Each branch is a row in the card. A
change on one branch is a card with one row, so both read the same way.

- The card is in the section of its most urgent branch. The order of
  urgency is the same for the owner and for a reviewer: Needs Changes, Needs
  Review, In Progress, Approved, Ready to Merge. If two branches have the
  same state, the card goes to the earlier section. Thus, on "Reviewing", a
  branch that waits on you comes before a branch that you reviewed.
- Each row shows the branch, the state, a "Private" badge on a change that
  is private in Gerrit, the WIP or Active badge, the change number, the patch set, the reviewers with their votes, the size of the
  diff, the time of the last update and the buttons of that change. The
  cards in a section share the same columns. Each branch is reviewed on its
  own. A vote on the master change does not count for the release change.
- The reviewers fit on one line. Reviewers who voted come first, a -1 before
  a +1. If there are too many, the rest are behind a "+N" chip. Point at it
  to see their names, or click it to show them all.
- A merged branch stays in the card. The row is grey, shows when the change
  was merged and has no buttons. Thus, while you work on a release branch,
  you can see that the change is already in on master. On the "Recently
  Merged" tab, the merged branch leads the card and the open branches are
  below it.
- The counts on the tabs and on the sections count cards, not changes. A
  family is one card, so it counts once however many branches it has, and
  a section counts only the cards under it. The card header says how many
  branches are in each state, for example "1 Approved · 2 Needs Review".
- In the compact window the card is a box in the section: a header line
  with the subject and the number of branches, then one line per branch,
  titled by the branch. Each line opens like any other line of the ledger.

![Changes grouped by Change-Id](docs/screenshots/change-id-groups.png)

`docs/mockups/change-id-groups/` has five mockups of ways to show a group.
The application uses mockup 3.

## Settings

The gear at the right of the tab row opens the settings in place of the
board, like a tab; any tab click closes them. The page has one section per
entry in its left column (Team, Mergers, Scope, App icon, Window, Menu bar,
About), and "Connection" at the bottom, which opens the connection window.
There is no Save button: every control is written as soon as it changes, and
the board follows at once. A "Saved" or "Saving…" pill in the section
header shows the state of the last write. Text fields are written when they
lose focus or on Enter. In the compact window the column is a picker above
the section.

## Teams

In "Settings", under "Team", add the people on your team. Enter a username
or an email address, or start to type and select an account from the server.
The comparison ignores case. You are always on the team, so you do not need
to add yourself.

The team decides where a change is listed, by its owner. It has no say in
the state of a change: the primary reviewers, tagged on each change, decide
that (refer to "The workflow"). When the team list has one or more entries:

- The "Team Reviews" tab lists every open change owned by someone else on
  the team, in groups by state, whether or not you are a reviewer of it.
  These changes stay on "Needs Review" and "Reviewing" as well, when they
  belong there.
- The "External Reviews" tab lists every open change owned by someone
  outside the team, in groups by state. Those changes are not on "Needs
  Review", "Reviewing" or "Merged", and the counts
  on those tabs and in the tray leave them out. Only the owner decides this:
  your own changes stay on "My Changes" even when CI or a maintainers list
  adds reviewers from outside the team.

When the team list is empty, both tabs are hidden. The team is a setting of
your computer. Each team member enters the same list.

![Team Reviews](docs/screenshots/team-reviews.png)

![External Reviews](docs/screenshots/external-reviews.png)

![Team in Settings](docs/screenshots/settings-team.png)

## Mergers

In "Settings", under "Mergers", list the people to offer when you ask for a
merge, by project. A row is a project and the people for it. The project is
an exact name, a prefix ending in `*`, or `*` alone for every project. A
change in `platform/core` gets the people from the rows `platform/core`,
`platform/*` and `*`, most specific row first.

The "Ready to Merge" button opens that list, with the person asked last time
for that project preselected. Once asked, the button reads "Change merger"
and opens the same list; "Clear ready-to-merge" is a link in that menu. "Someone else" searches the accounts on the
server for a one-off request; a checkbox under the search adds that person
to the row for the project. The list only fills the menu: a wrong or empty
list costs one search. It is a setting of your computer, and it does not
have to match anyone else's.

The person who was asked sees the change on the "Merged" tab under
"Asked of you", and nowhere else on that tab: a request for somebody else is
not listed. A person without +2 rights who was asked by mistake sees the
change with a hint to tell the author.

![Ready to Merge picker](docs/walkthrough/08-dev-pick-merger.png)

## The tray icon

The application stays open. It is independent of the browser.

The tray icon shows what waits on you, in four categories and always in this
order. The counts are cards, as on the tabs: a change on several branches
counts once per category, however many of its branches need that action.

| Category | Color | Glyph | Meaning |
| --- | --- | --- | --- |
| Needs Review | Blue | ◉ | The author asked you to review the current patch set. |
| Needs Changes | Red | ✎ | Your change has the "Needs Changes" state. |
| Approved | Green | ◆ | Your change is approved. Push "Ready to Merge". |
| Ready to Merge | Purple | ⇧ | The author asked you to merge the change. |

On macOS, the menu bar item shows one colored count per category that is not
zero. If you cannot tell the colors apart, select "Show glyphs instead of
colored counts" in the settings. The item then shows the glyph and the count
as text. The counts take the place of the app icon; the icon shows only when
nothing waits on you. Select "Always show Needs Review, Needs Changes and Approved, even at
zero" to keep those counts in place. The Ready to Merge count appears only when
someone asked you to merge, because most users never are. On Windows and Linux, the total is part of
the icon image, because these trays cannot show text. Clear "Show counts on
the menu bar icon" in the settings to keep the plain icon on every platform.
The tooltip and the tray menu show the counts by category on all platforms,
also with the counts off. A category in the tray menu opens a submenu with
one row per card: the number, the subject, the branch and, on Needs Review
and Ready to Merge, the owner. A row opens the change in the browser; on
Needs Review it opens the diff the Review button opens. A change on several
branches is one row that opens a submenu of its branches; a branch that does
not need the action is greyed out with the reason, so the family reads whole.
The last row of a submenu opens the tab that lists those changes, and a
category at zero opens its tab directly. Clicking the tray icon opens the
menu only; it does not raise the board window. The tray menu also has
Open board, Refresh, Compact window, Compact window stays on top, and Quit, and a
disabled row with the version and the
short git commit the build was made from (a trailing `+` means the working
tree had uncommitted changes). The total goes to the macOS dock, the Linux
launcher and the Windows taskbar overlay. Clear "Show the total as a badge
on the app icon" in the settings to turn that badge off.

Compact mode is a narrow window with a layout made for 320 to 460 pixels.
The tabs have short names in a strip that scrolls sideways. The board is a
table with one line per change: the subject, the WIP or Active state, the
reviewers as initials with their vote, and the one main button for that
change. Tap a line to open it. The open line shows the state, the reviewer
chips with add and remove, the other buttons, and a link to the change in
Gerrit. Start compact mode with the shrink button in the top bar or from the
tray menu. By default the compact
window stays on top of the other windows and moves with you to each
workspace. To turn that off, clear "Compact window stays on top" in
"Settings" or in the tray menu. The full-size window is never pinned. The
application keeps the position of the normal window and the position of the
compact window separately.

If you close the window, the application hides the window in the tray. To
stop the application, use "Quit" in the tray menu. Only one instance of the
application can run. If you start the application again, the application
shows the window that is already open.

## Start the application

You must have Node 22 or a newer version and pnpm. The `packageManager`
field in `package.json` gives the pnpm version. To get that version, run
`corepack enable` one time.

```sh
pnpm install
pnpm dev           # development build with hot reload
pnpm build && pnpm start
pnpm dist          # packaged application in dist/ (AppImage, dmg, nsis)
```

To install the application, download the signed build for your platform
from the GitHub releases page rather than packaging it yourself: only the
signed release build can update itself.

The `electron` package does not download the Electron binary at install time.
The `dev`, `build`, `start` and `dist` scripts download the binary first if it
is not present. On Ubuntu 24.04 and newer versions, the kernel does not permit
unprivileged user namespaces. The same scripts then show a one-time root
command that corrects the Electron sandbox.

The packaged AppImage has the same requirement on these systems. The usual
correction there is `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`.

At the first start, a "Connection" window opens. Enter the server URL, your
username and an HTTP password, and press "Test and save". The same window
opens later from "Connection" at the bottom of the settings page; it is the
only place that tests the connection and reloads the board.
Make the HTTP password in Gerrit under "Settings", "HTTP Credentials". The
server URL is the base URL of Gerrit. Include the path prefix. For example,
enter `https://host/gerrit1`, not only the host. You can also paste the URL of
a change or a dashboard. The application cuts that URL to the base URL. The
application stores the password with Electron `safeStorage`, which uses the
keychain of the operating system.

REST calls go through the Chromium network stack. Thus, the application trusts
the certificates that the operating system trusts, and it uses the proxy
settings of the system. You must install a private CA in the store that
Chromium reads:

| OS | Where to install the CA |
| --- | --- |
| macOS | Keychain Access, System or login keychain. Set the CA to "Always Trust". |
| Windows | Certificate store, "Trusted Root Certification Authorities". |
| Linux | The NSS user database, not the OpenSSL bundle: `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "Private CA" -i ca.crt` (package `libnss3-tools`). |

To see if the network stack of the application trusts a server, run
`pnpm exec electron scripts/net-check.cjs https://your-gerrit/`.

## Releases

Every pull request runs the "CI" workflow in GitHub Actions. It runs the
typecheck, the unit tests and the build, then the integration test against a
Gerrit 3.11 container, and last an unsigned packaging on Linux, macOS and
Windows. The workflow uses no secrets, so it also runs on pull requests from
forks.

GitHub runs no CI on a pull request that has a merge conflict; the checks
just do not appear. The "Merge check" workflow fills that gap. It runs when
a pull request is opened or gets a new commit, also with a conflict, and
fails with a message when GitHub reports the pull request as not mergeable.
Rebase the branch, resolve the conflict and push again; the CI workflow then
runs. The workflow uses the `pull_request_target` event, so it takes effect
for a pull request only after the workflow file is on `main`, and it never
runs code from the pull request.

Every push to `main` (a merged pull request) runs the "Release" workflow in
GitHub Actions. The workflow builds the AppImage, the macOS DMG for Intel and
Apple silicon, and the Windows installer, creates a `v` tag at that commit
and attaches the installers to a GitHub release for it. The version is the
one in `package.json` when no tag for it exists yet; otherwise the workflow
bumps the patch number of the newest `vX.Y.Z` tag. To release a new minor or
major version, raise the version in `package.json` in the pull request.

A push of a tag that starts with `v` (for example `v0.2.0`) releases that
exact version. A manual run of the workflow makes a draft release instead.

### Updates

The desktop application checks the releases of this repository for a newer
version shortly after it starts and then once an hour. When one exists, a
button in the top bar offers to download it. The download runs in the
background, and the button then offers a restart to finish the install. Nothing is downloaded or installed without a click. Settings has an
About section with the version, the release notes and a "Check for updates"
button, and the tray menu has the same action.

The updater reads the files the release workflow attaches next to the
installers: the `latest*.yml` manifests, the macOS `.zip` archives and the
`.blockmap` files. A release made by hand needs them too. On macOS the
application must be signed to update itself; the workflow signs it, a local
`pnpm dist` build does not, and that build reports an error on download
instead. Refer to `docs/testing.md` to try the flow from the source
tree.

The macOS build is signed with a Developer ID certificate and notarized with
an App Store Connect API key. The workflow reads these from the repository
secrets `CSC_LINK` (base64 of the `.p12`), `CSC_KEY_PASSWORD`,
`APPLE_API_KEY` (the text of the `.p8`), `APPLE_API_KEY_ID` and
`APPLE_API_ISSUER`. Linux and Windows builds are not signed.

## Browser mode

Electron needs a display. On a machine without a display, for example with VS
Code Remote SSH, you can use the same UI in a browser. Run:

```sh
pnpm web
```

This command starts two servers. The local API server is at 127.0.0.1:5174.
This is the part of the application that does not use Electron. The Vite
development server is at http://localhost:5173/. VS Code forwards this port
automatically. The application writes the settings that you enter in the
browser to `~/.config/gerrit-gui/web-settings.json`. The password in this file
is not encrypted. As an alternative, set `GERRIT_URL`, `GERRIT_USER` and
`GERRIT_PASSWORD` in the environment. The tray icon, the badge and compact
mode do not operate in a browser. All other functions operate.

## Tests

```sh
pnpm test                                # unit tests of the classifier
docker run -d --name gerrit-test -p 8080:8080 gerritcodereview/gerrit:3.11.2
./test/seed-gerrit.sh                    # users alice/bob/carol/dave, erin from another team, primary reviewers tagged, changes in each state
node --test test/integration.test.ts     # runs the real REST client through the full workflow
```

Refer to `docs/testing.md` for UI checks without a display, and to
`docs/walkthrough/shoot.sh` for the script that makes the screenshots in
`docs/walkthrough.md` against an empty Gerrit.

## Fallback dashboard

If you cannot use the application, use the Gerrit dashboard in
`gerrit-dashboard/`. This is a standard Gerrit project dashboard with similar
sections. Install it one time for the full server. Refer to
`gerrit-dashboard/README.md`. The dashboard has these limits:

- It cannot show that all reviewers approved a change.
- It cannot see the review request for a patch set.
- It cannot show the WIP changes that you review.

## Layout

- `src/shared/model.ts` is the state classifier. It has only pure functions. It has unit tests.
- `src/main/service.ts` has all the functions that the UI can call. It does not use Electron.
- `src/main/gerrit.ts` is the REST client. It gets a fetch implementation as an argument. Electron gives the Chromium fetch. The tests give the Node fetch.
- `src/main/settings.ts` stores the credentials in encrypted form.
- `src/main/tray.ts` controls the tray icon and the badge.
- `src/preload/index.ts` makes the service available to the renderer as `window.api`.
- `src/server/` gives the same service on loopback HTTP for browser mode.
- `src/renderer/` is the React UI.
