# Several teams: design record

Status: implemented. `README.md` describes the result.

## Before

Settings held one list of people, the team. It sorted other people's open
changes by owner between two tabs: Team Reviews for the team, External
Reviews for everyone else. The dashboard fetched every open change of the
team; External Reviews could only show what the user was on.

## Two questions, kept apart

A first version of this change gave every team the Team Reviews treatment
and put them all under one drop-down tab. That mixed two different
questions, and the answer to one depends on who is asking:

1. What is a team's backlog? Every open change the team owns, on it or
   not. An engineer wants this for their own team. A lead wants it for
   several. Nobody wants it for every team on the server, and answering
   it costs a query per team.
2. Which of the changes I am on come from outside my team? A slice of
   what involves the user. Costs nothing; the changes are fetched anyway.

So the design is: which backlogs to show is a per-user choice, made per
team in Settings, and it never changes what a tab means.

## Settings

    teams: [{ name: "Platform", members: ["alice", "bob"], watched: true }, ...]
    primaryTeam: "Platform"

A team is a name, a list of usernames or email addresses, and a watched
flag. The primary team is one of the names, or empty; it is watched
whatever its flag says. A settings file with the old `team` list is read
as one team named "Team", primary and watched, and written in the new form
on the next save.

The teams are still entered by hand. Gerrit's groups would be the natural
source (`GET /a/groups/`, `ownerin:` in queries), and the model is written
so that a team can come from there later: a team is a name and its people,
wherever the people come from.

## The board

The dashboard fetches the open changes of everyone on a watched team.
`classify` records, on each change, the names of the teams its owner is on
and whether one of them is watched. The signed-in user counts as on the
primary team whether or not the list says so, as before.

| Tab | Lists | There when |
| --- | --- | --- |
| Team tab | open changes owned by someone else on a watched team | a team is watched |
| External Reviews | open changes the user is on, owner not on the primary team | a primary team is picked |

The team tab is named after the primary team, or "Watched" without one.
With one watched team it is a plain tab. With several it is a split tab,
like the split buttons on the rows: the caret opens each watched team with
its count, then "Watched" for all together, and picking one changes the
list below. The label does not change; the check in the menu and the line
above the list say which is showing. The default is the primary team, or
all watched teams without one. The tab keeps the id `team-reviews` in the
code and the screenshot hook, with `&team=<name>` to pick a team and
`&team=-` for all.

External Reviews is by involvement: reviewer, tagged primary reviewer, or
asked merger. A watched team's change the user has no part in is fetched
for the team tab but is not on External Reviews.

The "+" reviewer picker on a change lists the primary team, or everyone on
any team when no primary team is picked.

## Not done

- Teams from Gerrit groups (see above).
- A team scope in the View menu's author filter, so Reviewing can be
  narrowed to one team's owners. The model has the owner's teams on each
  change, so it is a small addition.
- A change on the team tab under two watched teams is not marked as such.
