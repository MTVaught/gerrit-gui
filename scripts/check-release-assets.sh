#!/usr/bin/env bash
# Check that a directory holds every file a release needs, no more and no
# less: the installers, the macOS zip archives and blockmaps the in-app
# updater downloads, and the latest*.yml manifests it reads. A release with a
# file missing would publish fine and then break the updater for one platform,
# so this runs on each platform's dist/ after packaging and again on the merged
# set before anything is uploaded, in CI and in the Release workflow alike.
#
#   scripts/check-release-assets.sh [--exact] VERSION DIR [PLATFORM...]
#
# PLATFORM is linux, mac or win; all three when none is given. With --exact
# any other file in DIR is an error too; without it extra files are allowed,
# which a dist/ directory always has (builder-debug.yml, unpacked trees). The
# names come from build.artifactName and build.<os>.target in package.json.
set -euo pipefail

exact=false
if [ "${1:-}" = "--exact" ]; then
  exact=true
  shift
fi
version=${1:?version}
dir=${2:?directory}
shift 2
platforms=("$@")
[ "${#platforms[@]}" -gt 0 ] || platforms=(linux mac win)

expected=()
for p in "${platforms[@]}"; do
  case "$p" in
    linux)
      expected+=("gerrit-review-board-$version-linux-x86_64.AppImage" latest-linux.yml)
      ;;
    mac)
      for arch in x64 arm64; do
        for ext in dmg zip; do
          expected+=("gerrit-review-board-$version-mac-$arch.$ext" "gerrit-review-board-$version-mac-$arch.$ext.blockmap")
        done
      done
      expected+=(latest-mac.yml)
      ;;
    win)
      expected+=("gerrit-review-board-$version-win-x64.exe" "gerrit-review-board-$version-win-x64.exe.blockmap" latest.yml)
      ;;
    *)
      echo "unknown platform $p" >&2
      exit 2
      ;;
  esac
done

status=0
for name in "${expected[@]}"; do
  if [ ! -s "$dir/$name" ]; then
    echo "missing or empty: $name" >&2
    status=1
  fi
done
# Files nobody expects mean the artifact globs or the builder config drifted.
for path in "$dir"/*; do
  [ "$exact" = true ] && [ -f "$path" ] || continue
  name=$(basename "$path")
  found=false
  for e in "${expected[@]}"; do [ "$e" = "$name" ] && found=true; done
  if [ "$found" = false ]; then
    echo "unexpected file: $name" >&2
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  echo "release assets in $dir do not match version $version for: ${platforms[*]}" >&2
  ls -la "$dir" >&2
  exit "$status"
fi
echo "all ${#expected[@]} release files present in $dir for: ${platforms[*]}"
