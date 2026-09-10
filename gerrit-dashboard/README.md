# Fallback: the same views as a stock Gerrit dashboard

If someone cannot run the app, this project dashboard gives similar sections
using only Gerrit's query language. An admin installs it once for the whole
server, and `self` resolves to whoever opens it, so there is no per-developer
setup.

It is a fallback, not a substitute. Three things it cannot do:

- Show WIP changes you are reviewing. Gerrit's `reviewer:` operator excludes
  WIP changes, and dashboards have no client-side filtering. If review
  happens on WIP changes, that makes it close to useless for reviewers. It
  still works for authors.
- Say "every reviewer has voted". Gerrit's query language has no way to
  express that, so there is no Approved section. You can read approval off
  the Code-Review column.
- See the per-patch-set review request. "Needs Review" lists every change
  where you have no vote on the current patch set, including follow-up patch
  sets the author never asked anyone to look at.

## Install (admin, once)

A stock All-Projects is missing two permissions. On a fresh Gerrit 3.11.2,
admins could not create `refs/meta/dashboards/*` and regular users could not
read it. Grant these under All-Projects, Access:

| Reference | Permission | Group |
| --- | --- | --- |
| `refs/meta/dashboards/*` | Create, Push | Administrators |
| `refs/meta/dashboards/*` | Read | Registered Users |

Then push the dashboard file:

```sh
git clone "https://<gerrit>/a/All-Projects" && cd All-Projects
git fetch origin refs/meta/dashboards/team:refs/meta/dashboards/team 2>/dev/null \
  && git checkout refs/meta/dashboards/team || git checkout --orphan dashboards
git rm -rfq . 2>/dev/null; cp /path/to/team-review .
git add team-review && git commit -m "Team review dashboard"
git push origin HEAD:refs/meta/dashboards/team
```

The dashboard then lives at `https://<gerrit>/p/All-Projects/+/dashboard/team:team-review`.

## Put it in everyone's menu (admin, once)

Default user preferences live in All-Users on `refs/users/default`, in the
file `preferences.config`:

```
[my]
	url = #/p/All-Projects/+/dashboard/team:team-review
	title = Team review
```

Users who already customised their menu keep their own. Everyone else sees it.
