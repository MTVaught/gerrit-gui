# Several teams: design record

Status: implemented. `README.md` describes the result.

## Before

Settings held one list of people, the team. It sorted other people's open
changes by owner between two tabs: Team Reviews for the team, External
Reviews for everyone else. The dashboard fetched every open change of the
team; All Reviews could only show what the user was on.

## Goal

1. Several teams, each named, so that the changes from a neighbouring team
   are one list, not mixed with everything else.
2. One of them, optionally, is the user's own: what Team Reviews shows.
   Without it there is no Team Reviews tab.
3. All Reviews is the other teams, one at a time, and then Other for
   the owners on no team.
4. Nothing moves on the board after the update for a user with one team.

## Settings

    teams: [{ name: "Platform", members: ["alice", "bob"] }, ...]
    primaryTeam: "Platform"

A team is a name and a list of usernames or email addresses, as before. The
primary team is one of the names, or empty. A settings file with the old
`team` list is read as one team named "Team", picked as the primary, and
written in the new form on the next save.

The teams are still entered by hand. Gerrit's groups would be the natural
source (`GET /a/groups/`, `ownerin:` in queries), and the model is written
so that a team can come from there later: a team is a name and its people,
wherever the people come from.

## The board

`classify` records, on each change, the names of the teams its owner is
on. The signed-in user counts as on the primary team whether or not the
list says so, as before. From that:

| Tab | Owner | There when |
| --- | --- | --- |
| Team Reviews | someone else on the primary team | a primary team is picked |
| All Reviews, everyone | someone outside the primary team | at least one team |
| All Reviews, one team | someone on that team | at least one team |
| All Reviews, Other | someone on no team | at least one team |

The All Reviews tab is a native select box in the tab strip: it shows
what it lists and that list's count. Opening it offers All Reviews, which
is everyone outside the primary team together, then every team but the
primary one, each with its count, then Other. The tab keeps the id
`external-reviews` in the code and the screenshot hook. The primary team is
left out of All Reviews by default, since Team Reviews has it; the setting
`includeOwnTeam` puts it in the select and among everyone, for people who
want one tab with everything. Someone on two teams is
listed under both. Without a primary team every other owner
is external, and every team is in the picker.

The dashboard fetches the open changes of everyone on any team, so each
team's list is complete. Other lists only what the user is on or was asked
for, because the application does not know who else exists; the tab says
so.

The "+" reviewer picker on a change lists the primary team, or everyone on
any team when no primary team is picked.

## Not done

- Teams from Gerrit groups (see above).
- A change on All Reviews under two teams is not marked as such.
