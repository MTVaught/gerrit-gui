#!/usr/bin/env bash
# Attach the built installers to a GitHub release and publish it.
#
# Used by .github/workflows/release.yml. It replaces a release action that
# uploaded every asset at once and gave up at the first transient error from
# GitHub's upload backend ("Headers Timeout Error", "Error saving asset").
# This script uploads one asset at a time, retries each one, checks that
# every file landed with the right size, and only then publishes.
#
# The release is created as a draft, or an existing draft for the tag is
# reused, so a failed run never leaves a half-built public release. The tag
# itself is created by GitHub when the draft is published.
#
# Environment:
#   TAG         release tag, e.g. v1.2.3
#   TARGET      commit the tag should point at
#   ASSETS_DIR  directory whose files become the release assets
#   KEEP_DRAFT  "true" leaves the release as a draft (manual runs)
#   DRY_RUN     "true" stops after listing the files it would upload. CI runs
#               the script this way on every pull request, with the artifacts
#               laid out as the Release workflow lays them out, so a broken
#               job wiring (no files, wrong directory) fails there.
#   ATTEMPTS    upload attempts per asset (default 5)
#   TIMEOUT     seconds allowed per upload attempt (default 900)
#   GH_TOKEN    token with contents:write; GH_REPO the owner/repo
set -euo pipefail

: "${TAG:?}" "${TARGET:?}" "${ASSETS_DIR:?}" "${GH_TOKEN:?}" "${GH_REPO:?}"
KEEP_DRAFT="${KEEP_DRAFT:-false}"
DRY_RUN="${DRY_RUN:-false}"
ATTEMPTS="${ATTEMPTS:-5}"
TIMEOUT="${TIMEOUT:-900}"

shopt -s nullglob
files=("$ASSETS_DIR"/*)
if [ "${#files[@]}" -eq 0 ]; then
  echo "no files in $ASSETS_DIR" >&2
  exit 1
fi
for file in "${files[@]}"; do
  if [ ! -f "$file" ]; then
    echo "$file is not a regular file; the artifacts were not merged into one directory" >&2
    exit 1
  fi
done
echo "release $TAG at $TARGET with ${#files[@]} files:"
printf '  %s\n' "${files[@]##*/}"
if [ "$DRY_RUN" = "true" ]; then
  echo "dry run: not touching GitHub"
  exit 0
fi

# gh release view also finds draft releases by tag name, which the REST
# "get release by tag" endpoint does not.
if gh release view "$TAG" --json isDraft --jq .isDraft >/dev/null 2>&1; then
  echo "Reusing existing release $TAG, retargeting to $TARGET"
  gh release edit "$TAG" --target "$TARGET" >/dev/null
else
  echo "Creating draft release $TAG at $TARGET"
  gh release create "$TAG" --draft --title "$TAG" --target "$TARGET" --generate-notes >/dev/null
fi

for file in "${files[@]}"; do
  name=$(basename "$file")
  attempt=1
  # gh has no upload timeout of its own; a stalled upload would otherwise
  # hang the job for hours instead of being retried.
  until timeout "$TIMEOUT" gh release upload "$TAG" "$file" --clobber; do
    if [ "$attempt" -ge "$ATTEMPTS" ]; then
      echo "giving up on $name after $attempt attempts" >&2
      exit 1
    fi
    echo "upload of $name failed (attempt $attempt of $ATTEMPTS), retrying" >&2
    sleep $((attempt * 15))
    attempt=$((attempt + 1))
  done
  echo "uploaded $name"
done

# Every expected file must be on the release with the size we uploaded, and
# nothing else may be there (a stray asset from an earlier run, say).
expected=$(for file in "${files[@]}"; do printf '%s\t%s\n' "$(basename "$file")" "$(stat -c %s "$file")"; done | sort)
actual=$(gh release view "$TAG" --json assets --jq '.assets[] | "\(.name)\t\(.size)"' | sort)
if [ "$expected" != "$actual" ]; then
  echo "release assets do not match the built files:" >&2
  diff <(echo "$expected") <(echo "$actual") >&2 || true
  exit 1
fi
echo "all ${#files[@]} assets verified"

if [ "$KEEP_DRAFT" = "true" ]; then
  echo "leaving $TAG as a draft"
else
  gh release edit "$TAG" --draft=false >/dev/null
  echo "published $TAG"
fi
gh release view "$TAG" --json url --jq .url
