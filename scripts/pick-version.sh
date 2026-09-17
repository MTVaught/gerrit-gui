#!/usr/bin/env bash
# Decide the version and tag a Release run publishes. Prints three lines,
# version=, tag= and draft=, that release.yml appends to GITHUB_OUTPUT.
# test/pick-version.test.sh covers every branch below and runs in CI.
#
#   Tag push (refs/tags/v1.2.3)   that exact version; the tag exists already.
#   Push to main                  the version in package.json when it is newer
#                                 than every vX.Y.Z tag, otherwise a patch bump
#                                 of the newest tag. Fails when the tag exists.
#   Anything else (manual run)    the package.json version as a draft release
#                                 under a manual-<run number> tag.
#
# Environment: GITHUB_REF, GITHUB_REF_NAME, GITHUB_RUN_NUMBER as GitHub sets
# them. Reads package.json in the current directory and the local tags, so the
# checkout needs fetch-depth 0.
set -euo pipefail

pkg=$(node -p "require('./package.json').version")
draft=false
case "${GITHUB_REF:?}" in
  refs/tags/v*)
    version="${GITHUB_REF_NAME#v}"
    tag="$GITHUB_REF_NAME"
    ;;
  refs/heads/main)
    # Newest plain X.Y.Z tag; prereleases and odd tags are ignored.
    latest=$( { git tag -l 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true; } | sed 's/^v//' | sort -V | tail -n1)
    if [ -z "$latest" ]; then
      version="$pkg"
    elif [ "$pkg" != "$latest" ] && [ "$(printf '%s\n%s\n' "$latest" "$pkg" | sort -V | tail -n1)" = "$pkg" ]; then
      # package.json was bumped past the newest tag: honour it.
      version="$pkg"
    else
      IFS=. read -r major minor patch <<<"$latest"
      version="$major.$minor.$((patch + 1))"
    fi
    tag="v$version"
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      echo "tag $tag already exists" >&2
      exit 1
    fi
    ;;
  *)
    version="$pkg"
    tag="manual-${GITHUB_RUN_NUMBER:?}"
    draft=true
    ;;
esac

echo "version=$version"
echo "tag=$tag"
echo "draft=$draft"
