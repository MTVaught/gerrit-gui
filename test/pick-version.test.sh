#!/usr/bin/env bash
# Runs scripts/pick-version.sh against a throwaway git repository for each
# case release.yml can meet and compares the output. Run it from the
# repository root: test/pick-version.test.sh
set -euo pipefail

script=$(cd "$(dirname "$0")/.." && pwd)/scripts/pick-version.sh
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
git init -q
git config user.email test@example.com
git config user.name test
echo '{"version":"0.1.0"}' > package.json
git add package.json
git commit -qm init

fails=0
# expect NAME EXPECTED_OUTPUT -- ENV=VALUE...
expect() {
  local name=$1 want=$2 got
  shift 2
  if got=$(env -i PATH="$PATH" HOME="$HOME" "$@" "$script" 2>&1); then
    if [ "$got" = "$want" ]; then
      echo "ok   $name"
    else
      echo "FAIL $name"; printf '  want:\n%s\n  got:\n%s\n' "$want" "$got"; fails=$((fails + 1))
    fi
  else
    echo "FAIL $name (exit $?)"; printf '%s\n' "$got" | sed 's/^/  /'; fails=$((fails + 1))
  fi
}

main=(GITHUB_REF=refs/heads/main GITHUB_REF_NAME=main GITHUB_RUN_NUMBER=7)

expect 'main, no tags: package.json version' $'version=0.1.0\ntag=v0.1.0\ndraft=false' "${main[@]}"

git tag v0.1.0
git tag v0.1.2
git tag v0.1.10
git tag v0.1.11-rc1   # prerelease, ignored
git tag vnext         # odd tag, ignored
expect 'main, tags newer than package.json: patch bump of newest (numeric sort)' \
  $'version=0.1.11\ntag=v0.1.11\ndraft=false' "${main[@]}"

echo '{"version":"0.2.0"}' > package.json
expect 'main, package.json bumped past newest tag: package.json version' \
  $'version=0.2.0\ntag=v0.2.0\ndraft=false' "${main[@]}"

git tag v0.2.0
expect 'main, package.json equal to newest tag: patch bump' \
  $'version=0.2.1\ntag=v0.2.1\ndraft=false' "${main[@]}"

# The 'tag already exists' guard in the script cannot trip by construction (the
# computed tag is either newer than every tag or the package.json version
# above them). It stays as a safety net and has no case here.

expect 'tag push: that exact version' $'version=1.2.3\ntag=v1.2.3\ndraft=false' \
  GITHUB_REF=refs/tags/v1.2.3 GITHUB_REF_NAME=v1.2.3 GITHUB_RUN_NUMBER=7

expect 'manual run on a branch: draft under manual-<run>' $'version=0.2.0\ntag=manual-7\ndraft=true' \
  GITHUB_REF=refs/heads/feature GITHUB_REF_NAME=feature GITHUB_RUN_NUMBER=7

if [ "$fails" -ne 0 ]; then
  echo "$fails pick-version case(s) failed" >&2
  exit 1
fi
echo "pick-version: all cases passed"
