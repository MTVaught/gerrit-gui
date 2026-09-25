#!/usr/bin/env bash
# Makes the screenshots for docs/walkthrough.md: one change through the whole
# workflow, captured from the developer's, a reviewer's and the merger's
# profile at each step. Needs a fresh, empty Gerrit (nothing but the admin):
#
#   docker run -d --name gerrit-walk -p 8081:8080 gerritcodereview/gerrit:3.11.2
#   pnpm build
#   GERRIT_URL=http://localhost:8081 docs/walkthrough/shoot.sh
#
# The screenshots land next to this script. Profiles go under /tmp/gg-walk-*.
set -euo pipefail
cd "$(dirname "$0")/../.."
G=${GERRIT_URL:-http://localhost:8081}
OUT=docs/walkthrough
JAR=$(mktemp)

until curl -sf -o /dev/null "$G/config/server/version"; do echo "waiting for gerrit..."; sleep 5; done
login() {
  : > "$JAR"
  curl -s -L -c "$JAR" -b "$JAR" -o /dev/null "$G/login/%23%2F?account_id=1000000"
  XSRF=$(grep XSRF_TOKEN "$JAR" | awk '{print $7}' || true)
  [ -n "$XSRF" ]
}
until login; do echo "waiting for the admin account..."; sleep 5; done
admin() { curl -s -b "$JAR" -H "X-Gerrit-Auth: $XSRF" -H 'Content-Type: application/json' -X "$1" "$G$2" ${3:+--data "$3"} | sed '1{/^)\]}'"'"'$/d}'; }
as() { local u=$1 m=$2 p=$3 d=${4:-}; curl -s -u "$u:${u}pw" -H 'Content-Type: application/json' -X "$m" "$G/a$p" ${d:+--data "$d"} | sed '1{/^)\]}'"'"'$/d}'; }

echo "== users and project"
admin PUT "/accounts/self/password.http" '{"http_password":"adminpw"}' >/dev/null
admin PUT "/accounts/alice" '{"name":"Alice Adams","email":"alice@example.com","http_password":"alicepw"}' >/dev/null
admin PUT "/accounts/bob" '{"name":"Bob Brown","email":"bob@example.com","http_password":"bobpw"}' >/dev/null
admin PUT "/accounts/carol" '{"name":"Carol Chen","email":"carol@example.com","http_password":"carolpw"}' >/dev/null
admin PUT "/accounts/dave" '{"name":"Dave Diaz","email":"dave@example.com","http_password":"davepw"}' >/dev/null
admin PUT "/projects/platform%2Fcore" '{"create_empty_commit":true}' >/dev/null
admin PUT "/groups/Mergers" '{"members":["dave"]}' >/dev/null
MERGERS=$(admin GET "/groups/Mergers" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
admin POST "/projects/platform%2Fcore/access" "{\"add\":{\"refs/heads/*\":{\"permissions\":{\"label-Code-Review\":{\"label\":\"Code-Review\",\"rules\":{\"$MERGERS\":{\"action\":\"ALLOW\",\"min\":-2,\"max\":2}}},\"submit\":{\"rules\":{\"$MERGERS\":{\"action\":\"ALLOW\"}}}}}}}" >/dev/null
admin POST "/projects/platform%2Fcore/access" '{"add":{"refs/*":{"permissions":{"editHashtags":{"rules":{"global:Registered-Users":{"action":"ALLOW"}}}}}}}' >/dev/null

# One profile per person: same server, same team and mergers list.
profile() { # user
  local d=/tmp/gg-walk-$1
  rm -rf "$d"; mkdir -p "$d"
  cat > "$d/settings.json" <<JSON
{
  "serverUrl": "$G",
  "username": "$1",
  "password": "$1pw",
  "passwordEncrypted": false,
  "projects": [],
  "teams": [{ "name": "Platform", "members": ["alice", "bob", "carol", "dave"], "watched": true }],
  "primaryTeam": "Platform",
  "mergers": [{ "project": "platform/*", "people": ["dave"] }],
  "badgeStyle": "color",
  "showZeroCounts": false,
  "compactOnTop": true,
  "showAppBadge": true,
  "showTrayCounts": true,
  "ui": { "compact": ${2:-false} }
}
JSON
  echo "$d"
}
for u in alice bob carol dave; do profile $u >/dev/null; done

shot() { # user tab file [js]
  local u=$1 tab=$2 file=$3 js=${4:-}
  echo "-- $file ($u, $tab)"
  GERRIT_GUI_USER_DATA=/tmp/gg-walk-$u GERRIT_GUI_TAB=$tab GERRIT_GUI_SCREENSHOT="$OUT/$file" GERRIT_GUI_SCREENSHOT_JS="$js" \
    GERRIT_GUI_SCREENSHOT_DELAY=4000 xvfb-run -a ./node_modules/.bin/electron --no-sandbox . >/dev/null 2>&1 || echo "   shot failed"
}

# The change comes from a real git push, so patch set 1 carries the diff.
WORK=$(mktemp -d)
GURL=${G/:\/\//:\/\/alice:alicepw@}
git -c http.sslVerify=false clone -q "$GURL/platform/core" "$WORK/core"
curl -s -o "$WORK/core/.git/hooks/commit-msg" "$G/tools/hooks/commit-msg" && chmod +x "$WORK/core/.git/hooks/commit-msg"
git -C "$WORK/core" config user.name "Alice Adams"
git -C "$WORK/core" config user.email alice@example.com
push() { # text [amend]
  mkdir -p "$WORK/core/src"
  printf '%s\n' "$1" > "$WORK/core/src/parser.c"
  git -C "$WORK/core" add -A
  if [ -n "${2:-}" ]; then git -C "$WORK/core" commit -q --amend --no-edit
  else git -C "$WORK/core" commit -q -m "parser: accept trailing commas in config lists"; fi
  git -C "$WORK/core" push -q "$GURL/platform/core" HEAD:refs/for/master 2>/dev/null
}
vote() { as "$1" POST "/changes/$2/revisions/current/review" "{\"labels\":{\"Code-Review\":$3},\"message\":\"$4\"}" >/dev/null; }

echo "== 1. settings"
shot alice settings 01-settings.png "const h=document.querySelectorAll('.settings h2')[1]; h.scrollIntoView(); let p=h.parentElement; while(p && !/auto|scroll/.test(getComputedStyle(p).overflowY)) p=p.parentElement; (p||document.scrollingElement).scrollBy(0,-100)"

echo "== 2. alice pushes a change and adds reviewers"
push 'int parse_list(const char *s) { /* accept a trailing comma */ return 0; }'
ID=$(as alice GET "/changes/?q=owner:self+project:platform/core+is:open" | grep -o '"_number": *[0-9]*' | head -1 | grep -o '[0-9]*')
echo "change $ID"
as alice POST "/changes/$ID/reviewers" '{"reviewer":"bob"}' >/dev/null
as alice POST "/changes/$ID/reviewers" '{"reviewer":"carol"}' >/dev/null
as alice POST "/changes/$ID/hashtags" '{"add":["reviewer:bob","reviewer:carol"]}' >/dev/null
shot alice mine 02-dev-in-progress.png

echo "== 3. alice requests review"
as alice POST "/changes/$ID/custom_keyed_values" '{"add":{"review-requested-ps":"1"}}' >/dev/null
shot alice mine 03-dev-out-for-review.png
shot bob needs-my-review 04-reviewer-needs-review.png

echo "== 4. bob +1, carol -1"
vote bob $ID 1 "Looks right to me."
vote carol $ID -1 "Please also handle a lone comma."
shot alice mine 05-dev-needs-changes.png

echo "== 5. alice pushes PS2 and re-requests; both +1"
push 'int parse_list(const char *s) { /* accept a trailing or a lone comma */ return 0; }' amend
shot alice mine 06-dev-new-patch-set.png
as alice POST "/changes/$ID/custom_keyed_values" '{"add":{"review-requested-ps":"2"}}' >/dev/null
vote bob $ID 1 "Still good."
vote carol $ID 1 "Thanks, that covers it."
shot alice mine 07-dev-approved.png

echo "== 6. alice opens the Ready to Merge picker"
shot alice mine 08-dev-pick-merger.png "document.querySelector('.picker-wrap .btn').click()"

echo "== 7. alice asks dave"
as alice POST "/changes/$ID/hashtags" '{"add":["ready-to-merge","merger:dave"]}' >/dev/null
shot alice mine 09-dev-asked-dave.png
shot dave ready-to-merge 10-merger-queue.png
profile dave true >/dev/null
shot dave ready-to-merge 11-merger-queue-compact.png
profile dave >/dev/null
shot bob ready-to-merge 12-reviewer-not-asked.png

echo "== 8. dave merges"
vote dave $ID 2 ""
as dave POST "/changes/$ID/submit" '{}' >/dev/null
shot alice merged 13-dev-merged.png
echo "== done: $OUT"
