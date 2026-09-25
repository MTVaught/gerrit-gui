#!/usr/bin/env bash
# Adds a sequence to the seeded Gerrit (run test/seed-gerrit.sh first): four of
# Bob's changes built on each other on master, alice and carol as primary
# reviewers, plus a fifth built beside the third. Nothing is tagged; the
# owner sets the sequence up from the board.
set -euo pipefail
G=${GERRIT_URL:-http://localhost:8080}
as() { # USER METHOD PATH [JSON]
  local u=$1 m=$2 p=$3 d=${4:-}
  curl -s -u "$u:${u}pw" -H 'Content-Type: application/json' -X "$m" "$G/a$p" ${d:+--data "$d"} | sed '1{/^)\]}'"'"'$/d}'
}
num() { grep -o '"_number": *[0-9]*' | grep -o '[0-9]*'; }
# A change built on another: Gerrit takes the base change's current patch set as the parent.
on() { # owner subject base-change-number -> change number
  as "$1" POST "/changes/" "{\"project\":\"demo\",\"branch\":\"master\",\"subject\":\"$2\",\"base_change\":\"$3\"}" | num
}
newps() { # owner change
  curl -s -u "$1:${1}pw" -X PUT -H 'Content-Type: text/plain' --data "hello $RANDOM" "$G/a/changes/$2/edit/f.txt" >/dev/null
  as "$1" POST "/changes/$2/edit:publish" '{"notify":"NONE"}' >/dev/null
}
primary() { as "$1" POST "/changes/$2/reviewers" "{\"reviewer\":\"$3\"}" >/dev/null; as "$1" POST "/changes/$2/hashtags" "{\"add\":[\"reviewer:$3\"]}" >/dev/null; }
vote() { as "$1" POST "/changes/$2/revisions/current/review" "{\"labels\":{\"Code-Review\":$3},\"message\":\"$4\"}" >/dev/null; }
request() { as "$1" POST "/changes/$2/custom_keyed_values" "{\"add\":{\"review-requested-ps\":\"$3\"}}" >/dev/null; }

echo "== sequence"
Q1=$(as bob POST "/changes/" '{"project":"demo","branch":"master","subject":"Q1 Storage: add a migration runner","topic":"settings-table"}' | num)
primary bob $Q1 alice; primary bob $Q1 carol; request bob $Q1 1; vote alice $Q1 1 "ok"; vote carol $Q1 1 "ok"; echo "Q1=$Q1 (approved)"
Q2=$(on bob "Q2 Storage: migrate the settings table" $Q1); primary bob $Q2 alice; primary bob $Q2 carol; echo "Q2=$Q2"
Q3=$(on bob "Q3 Settings: read the new table" $Q2); primary bob $Q3 alice; primary bob $Q3 carol; request bob $Q3 1; vote carol $Q3 1 "ok"; echo "Q3=$Q3 (alice pending, built on PS 1 of Q2)"
# Q2 moves on to a second patch set after Q3 was built on its first.
newps bob $Q2; request bob $Q2 2; echo "Q2 now on PS 2, requested"
Q4=$(on bob "Q4 Settings: drop the legacy reader" $Q3); primary bob $Q4 alice; primary bob $Q4 carol; echo "Q4=$Q4 (not requested)"
Q5=$(on bob "Q5 Settings: cache the table reads" $Q2); primary bob $Q5 alice; echo "Q5=$Q5 (beside Q3, built on PS 2 of Q2)"
echo "== done"
