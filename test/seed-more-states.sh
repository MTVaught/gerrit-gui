#!/usr/bin/env bash
set -euo pipefail
G=${GERRIT_URL:-http://localhost:8080}
JAR=$(mktemp)
# Adds the states test/seed-gerrit.sh leaves out: in-person and second-round
# requests, stale ready-to-merge tags, a Verified label so Ready to Merge can
# be enabled, a named merger, an abandoned change and commit messages with
# tags. Run after seed-gerrit.sh on the same server:
#   GERRIT_URL=http://localhost:8080 ./test/seed-more-states.sh
curl -s -L -c "$JAR" -b "$JAR" -o /dev/null "$G/login/%23%2F?account_id=1000000"
XSRF=$(grep XSRF_TOKEN "$JAR" | awk '{print $7}')
admin() { curl -s -b "$JAR" -H "X-Gerrit-Auth: $XSRF" -H 'Content-Type: application/json' -X "$1" "$G$2" ${3:+--data "$3"} | sed '1{/^)\]}'"'"'$/d}'; }
as() { local u=$1 m=$2 p=$3 d=${4:-}; curl -s -u "$u:${u}pw" -H 'Content-Type: application/json' -X "$m" "$G/a$p" ${d:+--data "$d"} | sed '1{/^)\]}'"'"'$/d}'; }
mk() { as "$1" POST "/changes/" "{\"project\":\"demo\",\"branch\":\"master\",\"subject\":\"$2\",\"work_in_progress\":true}" | grep -o '"_number": *[0-9]*' | grep -o '[0-9]*'; }
newps() { curl -s -u "$1:${1}pw" -X PUT -H 'Content-Type: text/plain' --data "hello $RANDOM" "$G/a/changes/$2/edit/f.txt" >/dev/null; as "$1" POST "/changes/$2/edit:publish" '{"notify":"NONE"}' >/dev/null; }
primary() { as "$1" POST "/changes/$2/reviewers" "{\"reviewer\":\"$3\"}" >/dev/null; as "$1" POST "/changes/$2/hashtags" "{\"add\":[\"reviewer:$3\"]}" >/dev/null; }
vote() { as "$1" POST "/changes/$2/revisions/current/review" "{\"labels\":{\"$3\":$4},\"message\":\"$5\"}" >/dev/null; }
request() { as "$1" POST "/changes/$2/custom_keyed_values" "{\"add\":{\"review-requested-ps\":\"$3\"}}" >/dev/null; }
inperson() { as "$1" POST "/changes/$2/custom_keyed_values" "{\"add\":{\"in-person-review-ps\":\"$3\"}}" >/dev/null; }
ready() { as "$1" POST "/changes/$2/hashtags" "{\"add\":[\"ready-to-merge\"${4:+,\"merger:$4\"}]}" >/dev/null; as "$1" POST "/changes/$2/custom_keyed_values" "{\"add\":{\"ready-to-merge-ps\":\"$3\"}}" >/dev/null; }
active() { as "$1" POST "/changes/$2/ready" '{}' >/dev/null; }

echo "== Verified label, votable by anyone"
admin PUT "/projects/demo/labels/Verified" '{"commit":"add Verified","values":{"-1":"Fails","0":"No score","+1":"Verified"},"function":"NoBlock"}' >/dev/null
admin POST "/projects/demo/access" '{"add":{"refs/heads/*":{"permissions":{"label-Verified":{"label":"Verified","rules":{"global:Registered-Users":{"action":"ALLOW","min":-1,"max":1}}}}}}}' >/dev/null

echo "== extra states"
S1=$(mk alice "S1 in-person review requested, nobody has reviewed"); primary alice $S1 bob; primary alice $S1 carol; request alice $S1 1; inperson alice $S1 1; echo "S1=$S1"
S2=$(mk alice "S2 in-person, second round (bob -1 on PS1, PS2 requested)"); primary alice $S2 bob; request alice $S2 1; vote bob $S2 Code-Review -1 "fix"; newps alice $S2; request alice $S2 "1,2"; inperson alice $S2 2; echo "S2=$S2"
S3=$(mk alice "S3 pass-around, second round (bob -1 on PS1, PS2 requested)"); primary alice $S3 bob; request alice $S3 1; vote bob $S3 Code-Review -1 "fix"; newps alice $S3; request alice $S3 "1,2"; echo "S3=$S3"
S4=$(mk alice "S4 approved with stale ready-to-merge tag from PS1, still WIP"); primary alice $S4 bob; request alice $S4 1; vote bob $S4 Code-Review 1 "ok"; ready alice $S4 1 dave; newps alice $S4; request alice $S4 "1,2"; vote bob $S4 Code-Review 1 "ok again"; echo "S4=$S4"
S5=$(mk alice "S5 iterating with stale ready-to-merge tag (PS2 pushed, not re-requested)"); primary alice $S5 bob; request alice $S5 1; vote bob $S5 Code-Review 1 "ok"; ready alice $S5 1 dave; newps alice $S5; echo "S5=$S5"
S6=$(mk alice "S6 approved, active, CI not yet verified"); primary alice $S6 bob; request alice $S6 1; vote bob $S6 Code-Review 1 "ok"; active alice $S6; echo "S6=$S6"
S7=$(mk alice "S7 approved, active, verified: Ready to Merge enabled"); primary alice $S7 bob; request alice $S7 1; vote bob $S7 Code-Review 1 "ok"; active alice $S7; vote ci-bot $S7 Verified 1 "build ok"; echo "S7=$S7"
S8=$(mk alice "S8 ready to merge, dave asked, verified"); primary alice $S8 bob; request alice $S8 1; vote bob $S8 Code-Review 1 "ok"; active alice $S8; vote ci-bot $S8 Verified 1 "build ok"; ready alice $S8 1 dave; echo "S8=$S8"
S9=$(mk alice "S9 approved, active, CI failed (Verified -1)"); primary alice $S9 bob; request alice $S9 1; vote bob $S9 Code-Review 1 "ok"; active alice $S9; vote ci-bot $S9 Verified -1 "build failed"; echo "S9=$S9"
S10=$(mk alice "S10 needs changes, active (CI running)"); primary alice $S10 bob; request alice $S10 1; vote bob $S10 Code-Review -1 "nope"; active alice $S10; echo "S10=$S10"
S11=$(mk alice "S11 abandoned"); as alice POST "/changes/$S11/abandon" '{}' >/dev/null; echo "S11=$S11"
B3=$(mk bob "B3 bob's change, in-person review with alice"); primary bob $B3 alice; request bob $B3 1; inperson bob $B3 1; echo "B3=$B3"
B4=$(mk bob "B4 bob's change, alice -1 then PS2 re-requested"); primary bob $B4 alice; request bob $B4 1; vote alice $B4 Code-Review -1 "fix"; newps bob $B4; request bob $B4 "1,2"; echo "B4=$B4"
B5=$(mk bob "B5 bob's change, ready to merge, alice asked to merge"); primary bob $B5 carol; request bob $B5 1; vote carol $B5 Code-Review 1 "ok"; active bob $B5; vote ci-bot $B5 Verified 1 "ok"; ready bob $B5 1 alice; echo "B5=$B5"
B6=$(mk bob "B6 bob's change, stale tag, alice was the merger"); primary bob $B6 carol; request bob $B6 1; vote carol $B6 Code-Review 1 "ok"; ready bob $B6 1 alice; newps bob $B6; echo "B6=$B6"

# Rewrite the commit message with trailers, keeping the Change-Id, and publish it as the next patch set.
tags() { # owner change trailers...
  local u=$1 id=$2; shift 2
  local cid; cid=$(as "$u" GET "/changes/$id/revisions/current/commit" | python3 -c "import json,sys; m=json.load(sys.stdin)['message']; print([l for l in m.splitlines() if l.startswith('Change-Id:')][0])")
  local subj; subj=$(as "$u" GET "/changes/$id" | python3 -c "import json,sys; print(json.load(sys.stdin)['subject'])")
  local body="$subj\n\nSome words about why.\n\n"; for t in "$@"; do body+="$t\n"; done; body+="$cid\n"
  as "$u" PUT "/changes/$id/edit:message" "$(python3 -c "import json,sys; print(json.dumps({'message': sys.argv[1].encode().decode('unicode_escape')}))" "$body")" >/dev/null
  as "$u" POST "/changes/$id/edit:publish" '{"notify":"NONE"}' >/dev/null
}
G1=$(mk alice "G1 two tags, review requested"); tags alice $G1 "Bug: 4242" "Tested-by: CI"; primary alice $G1 bob; request alice $G1 2; echo "G1=$G1"
G2=$(mk alice "G2 one tag, approved"); tags alice $G2 "Bug: 17"; primary alice $G2 bob; request alice $G2 2; vote bob $G2 Code-Review 1 "ok"; echo "G2=$G2"
G3=$(mk alice "G3 three tags, in progress"); tags alice $G3 "Bug: 1" "Fixes: 2" "Reviewed-on: 3"; echo "G3=$G3"
B7=$(mk bob "B7 bob's change with a tag, alice asked"); tags bob $B7 "Bug: 99"; primary bob $B7 alice; request bob $B7 2; echo "B7=$B7"
echo "== done"
