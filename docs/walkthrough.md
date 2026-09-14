# Your first review, step by step

This is one change going through the whole workflow, as seen from three
windows: Alice, who wrote the change; Bob, who reviews it; and Dave, the
team lead who merges it. Carol is the second reviewer. Every screenshot is
the application as each of them sees it at that moment.

The application has no state of its own. Everything below is votes,
hashtags and one custom value on the change in Gerrit, so what you see in
Gerrit matches what you see here.

## Before you start: Settings

Each person enters the server, their username and an HTTP password. Then
two lists, the same on every computer on the team:

- **Team**: the people whose votes decide. Alice, Bob, Carol and Dave.
- **Mergers**: who to offer when asking for a merge, by project. Here,
  `platform/*` has Dave.

![Settings: team and mergers](walkthrough/01-settings.png)

## 1. Alice pushes a change and adds reviewers

Alice pushes to `platform/core` and adds Bob and Carol as reviewers, in
Gerrit or with the "+" on the row. Nothing is asked of anyone yet: the
change is "In Progress" on Alice's **My Changes** tab, and it is not on
Bob's **Needs Review** tab. Alice can push as many patch sets as she likes.

![Alice: in progress](walkthrough/02-dev-in-progress.png)

## 2. Alice requests review

When patch set 1 is ready, Alice pushes **Request review (PS 1)**. The change
moves to "Out for review" and both reviewer chips turn blue: asked, not yet
voted.

![Alice: out for review](walkthrough/03-dev-out-for-review.png)

Bob now sees the change on **Needs Review**. The **Review** button opens
the diff in Gerrit. Bob votes there.

![Bob: needs review](walkthrough/04-reviewer-needs-review.png)

## 3. The reviewers vote

Bob votes +1. Carol votes -1 and asks for a lone comma to be handled. The
state is decided only when the last reviewer has voted: with both votes
in and one of them negative, the change is "Needs Changes" for Alice.

![Alice: needs changes](walkthrough/05-dev-needs-changes.png)

## 4. Alice pushes a fix

Alice pushes patch set 2. Gerrit clears the votes. The change goes back to
"In Progress": the request was for patch set 1, so nobody is asked to look
at patch set 2 until Alice says so. The reviewer chips are grey again.

![Alice: new patch set](walkthrough/06-dev-new-patch-set.png)

Alice pushes **Re-request review (PS 2)**. Bob and Carol both vote +1. The
change is "Approved", and the primary button is now **Ready to Merge**.

![Alice: approved](walkthrough/07-dev-approved.png)

## 5. Alice asks Dave to merge

**Ready to Merge** opens a menu. The mergers for `platform/core` from
Settings are listed, Dave is preselected, and a search field finds anyone
else on the server for a one-off request. Alice confirms with
**Ask Dave Diaz to merge**.

![Alice: pick the merger](walkthrough/08-dev-pick-merger.png)

The row now reads "Ready to Merge · Dave Diaz", so Alice can see who she
asked without opening Gerrit. **Change merger** asks someone else instead.

![Alice: asked Dave](walkthrough/09-dev-asked-dave.png)

## 6. Dave merges

Dave's **Ready to Merge** tab is his queue: the changes people asked him, by
name, to merge. The tray count and a desktop notification point him here.
**+2 and submit** votes +2 and submits in one step.

![Dave: asked of you](walkthrough/10-merger-queue.png)

The same queue in the compact window, which stays on top of other windows:

![Dave: compact window](walkthrough/11-merger-queue-compact.png)

Bob was not asked, so his **Ready to Merge** tab is empty. A request names
one person, and nobody else is prompted.

![Bob: nothing to merge](walkthrough/12-reviewer-not-asked.png)

## 7. Merged

After Dave submits, the change is on everyone's **Recently Merged** tab for
14 days.

![Alice: merged](walkthrough/13-dev-merged.png)

## What each button writes to Gerrit

| Button | Gerrit |
| --- | --- |
| Request review | Custom value `review-requested-ps` = the patch set number |
| Review | Opens Gerrit; the vote is Gerrit's own Code-Review +1 or -1 |
| Ready to Merge | Hashtags `ready-to-merge` and `merger:dave` |
| Change merger | Replaces the `merger:` hashtag |
| +2 and submit | Code-Review +2, then submit |

To make these screenshots again, run `docs/walkthrough/shoot.sh` against an
empty Gerrit; the header of the script says how.
