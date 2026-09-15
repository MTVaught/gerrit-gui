#!/usr/bin/env bash
# Seeds a throwaway Gerrit (DEVELOPMENT_BECOME_ANY_ACCOUNT) with users and changes
# covering every state of the review workflow. Run once on a fresh container:
#   docker run -d --name gerrit-test -p 8080:8080 gerritcodereview/gerrit:3.11.2
set -euo pipefail
G=${GERRIT_URL:-http://localhost:8080}
JAR=$(mktemp)
until curl -sf -o /dev/null "$G/config/server/version"; do echo "waiting for gerrit..."; sleep 5; done
# Become the bootstrap admin (account 1000000 is created by the ootb plugin).
# The plugin runs shortly after the server starts to answer, so a login right
# after the version check can come back without a session. Retry until the
# XSRF cookie is there instead of failing on an empty token.
login() {
  : > "$JAR"
  curl -s -L -c "$JAR" -b "$JAR" -o /dev/null "$G/login/%23%2F?account_id=1000000"
  XSRF=$(grep XSRF_TOKEN "$JAR" | awk '{print $7}' || true)
  [ -n "$XSRF" ]
}
until login; do echo "waiting for the admin account..."; sleep 5; done
admin() { # METHOD PATH [JSON]
  curl -s -b "$JAR" -H "X-Gerrit-Auth: $XSRF" -H 'Content-Type: application/json' -X "$1" "$G$2" ${3:+--data "$3"} | sed '1{/^)\]}'"'"'$/d}'
}
# Per-user REST via HTTP password (the same auth path the Electron app uses).
as() { # USER METHOD PATH [JSON]
  local u=$1 m=$2 p=$3 d=${4:-}
  curl -s -u "$u:${u}pw" -H 'Content-Type: application/json' -X "$m" "$G/a$p" ${d:+--data "$d"} | sed '1{/^)\]}'"'"'$/d}'
}

echo "== users"
admin PUT "/accounts/self/password.http" '{"http_password":"adminpw"}' >/dev/null
for u in alice bob carol dave; do
  admin PUT "/accounts/$u" "{\"name\":\"${u^}\",\"email\":\"$u@example.com\",\"http_password\":\"${u}pw\"}" >/dev/null
done
admin PUT "/accounts/ci-bot" '{"name":"CI Bot","email":"ci@example.com","http_password":"ci-botpw","groups":["Service Users"]}' >/dev/null
# erin is a reviewer from another team: keep her off the team list in Settings.
admin PUT "/accounts/erin" '{"name":"Erin (other team)","email":"erin@other.example.com","http_password":"erinpw"}' >/dev/null
# Five more, so one change can have more reviewers than fit on a line.
for u in frank grace heidi ivan judy; do
  admin PUT "/accounts/$u" "{\"name\":\"${u^}\",\"email\":\"$u@example.com\",\"http_password\":\"${u}pw\"}" >/dev/null
done
admin GET "/accounts/?q=is:active&o=DETAILS" | grep -o '"username": *"[^"]*"' | tr '\n' ' '; echo

echo "== project (reviewers may vote -1..+1; the merger group gets +2 and Submit)"
admin PUT "/projects/demo" '{"create_empty_commit":true}' >/dev/null
admin PUT "/groups/Mergers" '{"members":["dave"]}' >/dev/null
MERGERS=$(admin GET "/groups/Mergers" | grep -o '"id": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
admin POST "/projects/demo/access" "{\"add\":{\"refs/heads/*\":{\"permissions\":{\"label-Code-Review\":{\"label\":\"Code-Review\",\"rules\":{\"$MERGERS\":{\"action\":\"ALLOW\",\"min\":-2,\"max\":2}}},\"submit\":{\"rules\":{\"$MERGERS\":{\"action\":\"ALLOW\"}}}}}}}" >/dev/null
# Anyone may tag or untag a primary reviewer, so everyone needs Edit Hashtags (Gerrit grants it to the owner only by default).
admin POST "/projects/demo/access" '{"add":{"refs/*":{"permissions":{"editHashtags":{"rules":{"global:Registered-Users":{"action":"ALLOW"}}}}}}}' >/dev/null

# Everything is pushed WIP; WIP is cleared only to run CI.
mk() { # owner subject [private] -> change number
  as "$1" POST "/changes/" "{\"project\":\"demo\",\"branch\":\"master\",\"subject\":\"$2\",\"work_in_progress\":true,\"is_private\":${3:-false}}" | grep -o '"_number": *[0-9]*' | grep -o '[0-9]*'
}
newps() { # owner change -> publish a new patch set via a change edit
  curl -s -u "$1:${1}pw" -X PUT -H 'Content-Type: text/plain' --data "hello $RANDOM" "$G/a/changes/$2/edit/f.txt" >/dev/null
  as "$1" POST "/changes/$2/edit:publish" '{"notify":"NONE"}' >/dev/null
}
# A plain reviewer in Gerrit: shown on the change, not waited for.
reviewers() { as "$1" POST "/changes/$2/reviewers" "{\"reviewer\":\"$3\"}" >/dev/null; }
# A primary reviewer: added in Gerrit and tagged reviewer:<user>; these votes decide the state.
primary() { reviewers "$1" "$2" "$3"; as "$1" POST "/changes/$2/hashtags" "{\"add\":[\"reviewer:$3\"]}" >/dev/null; }
vote() { as "$1" POST "/changes/$2/revisions/current/review" "{\"labels\":{\"Code-Review\":$3},\"message\":\"$4\"}" >/dev/null; }
request() { as "$1" POST "/changes/$2/custom_keyed_values" "{\"add\":{\"review-requested-ps\":\"$3\"}}" >/dev/null; }
# Ready to merge: the tag plus the patch set it is for, as the app writes them.
ready() { as "$1" POST "/changes/$2/hashtags" '{"add":["ready-to-merge"]}' >/dev/null; as "$1" POST "/changes/$2/custom_keyed_values" "{\"add\":{\"ready-to-merge-ps\":\"$3\"}}" >/dev/null; }

echo "== changes"
C1=$(mk alice "C1 in progress, no reviewers, nothing requested"); echo "C1=$C1"
C2=$(mk alice "C2 review requested, nobody has reviewed"); primary alice $C2 bob; primary alice $C2 carol; request alice $C2 1; echo "C2=$C2"
C3=$(mk alice "C3 bob reviewed, carol pending"); primary alice $C3 bob; primary alice $C3 carol; request alice $C3 1; vote bob $C3 1 "LGTM"; echo "C3=$C3"
C4=$(mk alice "C4 needs changes (carol -1)"); primary alice $C4 bob; primary alice $C4 carol; request alice $C4 1; vote bob $C4 1 "ok"; vote carol $C4 -1 "please rename"; echo "C4=$C4"
C5=$(mk alice "C5 approved by everyone, still WIP"); primary alice $C5 bob; primary alice $C5 carol; request alice $C5 1; vote bob $C5 1 "ok"; vote carol $C5 1 "ship it"; echo "C5=$C5"
C6=$(mk alice "C6 ready-to-merge and active (CI running)"); primary alice $C6 bob; request alice $C6 1; vote bob $C6 1 "ok"; ready alice $C6 1; as alice POST "/changes/$C6/ready" '{}' >/dev/null; echo "C6=$C6"
C7=$(mk alice "C7 bob +1 on PS1, then PS2 pushed without re-request"); primary alice $C7 bob; request alice $C7 1; vote bob $C7 1 "ok v1"; newps alice $C7; echo "C7=$C7"
C8=$(mk alice "C8 carol -1 on PS1, author pushed PS2 and PS3 (fixing)"); primary alice $C8 carol; request alice $C8 1; vote carol $C8 -1 "fix"; newps alice $C8; newps alice $C8; echo "C8=$C8"
C9=$(mk alice "C9 bot is a reviewer, bob (primary) pending"); primary alice $C9 bob; reviewers alice $C9 ci-bot; request alice $C9 1; echo "C9=$C9"
C10=$(mk alice "C10 reviewers added but review not requested yet"); primary alice $C10 bob; primary alice $C10 carol; echo "C10=$C10"
B1=$(mk bob "B1 bob's change, alice+carol requested"); primary bob $B1 alice; primary bob $B1 carol; request bob $B1 1; echo "B1=$B1"
B2=$(mk bob "B2 bob's change, alice already +1"); primary bob $B2 alice; request bob $B2 1; vote alice $B2 1 "fine"; echo "B2=$B2"
# Private changes: Gerrit shows them to the owner, the reviewers and the CCs only. The board lists them last on My Changes.
V1=$(mk alice "V1 private, bob asked to review" true); primary alice $V1 bob; request alice $V1 1; echo "V1=$V1"
V2=$(mk alice "V2 private, no reviewers yet" true); echo "V2=$V2"
V3=$(mk alice "V3 private, approved by bob" true); primary alice $V3 bob; request alice $V3 1; vote bob $V3 1 "ok"; echo "V3=$V3"
# erin is a plain reviewer on X1-X3: her votes are shown but never decide. With team alice,bob,carol,dave in Settings, E1 is on the External Reviews tab.
X1=$(mk alice "X1 bob (primary) +1, erin (not primary) -1"); primary alice $X1 bob; reviewers alice $X1 erin; request alice $X1 1; vote bob $X1 1 "ok"; vote erin $X1 -1 "our side needs a flag"; echo "X1=$X1"
X2=$(mk alice "X2 bob and carol (primary) +1, erin (not primary) has not voted"); primary alice $X2 bob; primary alice $X2 carol; reviewers alice $X2 erin; request alice $X2 1; vote bob $X2 1 "ok"; vote carol $X2 1 "ok"; echo "X2=$X2"
X3=$(mk alice "X3 only erin is a reviewer and nobody is primary, erin +1"); reviewers alice $X3 erin; request alice $X3 1; vote erin $X3 1 "fine by us"; echo "X3=$X3"
E1=$(mk erin "E1 erin's change, bob and carol asked to review"); primary erin $E1 bob; primary erin $E1 carol; request erin $E1 1; echo "E1=$E1"
# Tagged as primary without being on the change in Gerrit: still waited for, shown as a stand-in.
T1=$(mk alice "T1 carol tagged primary but not a reviewer in Gerrit, bob +1"); primary alice $T1 bob; as alice POST "/changes/$T1/hashtags" '{"add":["reviewer:carol"]}' >/dev/null; request alice $T1 1; vote bob $T1 1 "ok"; echo "T1=$T1"
# Nine reviewers: the board truncates the chips to one line and keeps the votes visible.
M1=$(mk alice "M1 many reviewers: bob, carol, dave primary; frank -1, grace +1 not primary"); for r in bob carol dave; do primary alice $M1 $r; done; for r in frank grace heidi ivan judy erin; do reviewers alice $M1 $r; done; request alice $M1 1; vote frank $M1 -1 "nope"; vote grace $M1 1 "ok"; vote erin $M1 1 "ok"; echo "M1=$M1"

# Cherry-picks keep the Change-Id of the original, so each one is a separate
# change that the board groups with its siblings.
echo "== cherry-picks (same Change-Id on release branches)"
admin PUT "/projects/demo/branches/release-1.0" '{"revision":"master"}' >/dev/null
admin PUT "/projects/demo/branches/release-2.0" '{"revision":"master"}' >/dev/null
cp() { # owner change branch -> new change number
  as "$1" POST "/changes/$2/revisions/current/cherrypick" "{\"destination\":\"$3\",\"allow_empty\":true,\"notify\":\"NONE\"}" | grep -o '"_number": *[0-9]*' | grep -o '[0-9]*'
}
P1=$(cp alice $C5 release-2.0); primary alice $P1 bob; primary alice $P1 carol; request alice $P1 1; vote bob $P1 1 "ok"; vote carol $P1 1 "ok"; echo "C5->release-2.0=$P1 (approved)"
P2=$(cp alice $C5 release-1.0); primary alice $P2 bob; primary alice $P2 carol; request alice $P2 1; echo "C5->release-1.0=$P2 (out for review)"
P3=$(cp alice $C4 release-2.0); primary alice $P3 bob; primary alice $P3 carol; request alice $P3 1; vote bob $P3 1 "ok"; vote carol $P3 -1 "same rename here"; echo "C4->release-2.0=$P3 (needs changes)"
P4=$(cp alice $C2 release-2.0); echo "C2->release-2.0=$P4 (in progress)"
P5=$(cp alice $C6 release-1.0); primary alice $P5 bob; request alice $P5 1; vote bob $P5 1 "ok"; ready alice $P5 1; as alice POST "/changes/$P5/ready" '{}' >/dev/null; echo "C6->release-1.0=$P5 (ready to merge)"
vote dave $C6 2 "merging"; as dave POST "/changes/$C6/submit" '{}' >/dev/null; echo "C6 merged on master"
echo "== done"
