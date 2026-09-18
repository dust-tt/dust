#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" = 0 ]; then
  echo "Run Frame lint as the sandbox user, not root" >&2
  exit 1
fi

# GCS Fuse makes repeated config reads slow. Cache the skill files on local disk.
checker_cache=${DUST_FRAME_CHECKER_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/dust/frame-checker}
checker="$checker_cache/checker"
if [ "$0" != "$checker/lint.sh" ]; then
  if [ ! -f "$checker/lint.sh" ]; then
    templates=$(dirname -- "$0")
    mkdir -p -- "$checker_cache"
    staging=$(mktemp -d "$checker_cache/.copy.XXXXXX")
    trap 'rm -rf -- "$staging"' EXIT
    mkdir "$staging/checker"
    cp -- "$templates/lint.sh" "$templates/tsconfig.json" \
      "$templates/oxlintrc.json" "$staging/checker/"
    # Publish all three files together, including when two lint calls start at once.
    if ! mv "$staging/checker" "$checker_cache/"; then
      test -f "$checker/lint.sh"
    fi
    rm -rf -- "$staging"
    trap - EXIT
  fi
  exec bash "$checker/lint.sh" "$@"
fi

templates=$(cd -- "$(dirname -- "$0")" && pwd)
project=$(cd -- "${1:-.}" && pwd)
viz_url=${DUST_VIZ_URL:?Set DUST_VIZ_URL to the Viz origin}
cache=${DUST_FRAME_TYPES_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/dust/frame-types}

if [ ! -f "$project/manifest.json" ] && [ ! -f "$project/index.tsx" ]; then
  echo "Expected a Frame folder containing manifest.json or index.tsx" >&2
  exit 1
fi

manifest=$(curl --fail --silent --show-error --location --max-time 30 \
  --max-filesize 65536 "${viz_url%/}/frame-runtime/manifest.json")
id=$(jq -er 'select(.version == 1) | .id | select(test("^[a-f0-9]{64}$"))' <<< "$manifest")
checksum=$(jq -er '.tarballSha256 | select(test("^[a-f0-9]{64}$"))' <<< "$manifest")
size=$(jq -er '.sizeBytes | select(. > 0 and . <= 20971520)' <<< "$manifest")
modules=$(jq -ce '.modules | select(length > 0 and all(.[]; type == "string"))' <<< "$manifest")
mkdir -p -- "$cache"
cache=$(cd -- "$cache" && pwd)
types="$cache/$id"

if [ ! -d "$types" ]; then
  staging=$(mktemp -d "$cache/.download.XXXXXX")
  trap 'rm -rf -- "$staging"' EXIT
  archive="$staging/types.tgz"
  curl --fail --silent --show-error --location --max-time 30 \
    --max-filesize 20971520 --output "$archive" \
    "${viz_url%/}/frame-runtime/$checksum.tgz"
  if [ "$(wc -c < "$archive" | tr -d ' ')" != "$size" ]; then
    echo "Viz types archive size mismatch" >&2
    exit 1
  fi
  if command -v sha256sum >/dev/null; then
    actual=$(sha256sum "$archive")
  else
    actual=$(shasum -a 256 "$archive")
  fi
  if [ "${actual%% *}" != "$checksum" ]; then
    echo "Viz types archive checksum mismatch" >&2
    exit 1
  fi
  mkdir "$staging/$id"
  tar -xzf "$archive" -C "$staging/$id"
  test -f "$staging/$id/tsconfig.json"
  test -f "$staging/$id/index.d.ts"
  # A concurrent lint may have cached the same archive already.
  if ! mv "$staging/$id" "$cache/"; then
    test -f "$types/tsconfig.json"
  fi
  rm -rf -- "$staging"
  trap - EXIT
fi

# Oxlint finds tsconfig beside the source, even with --tsconfig.
# Local directories with source symlinks keep those lookups off GCS Fuse.
work=$(mktemp -d "$cache/.lint.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
cp -Rs -- "$project/." "$work/"
# A read-only source mount must not make the temporary directories read-only.
find "$work" -type d -exec chmod u+w {} +
# Remove the config symlinks before writing so the originals stay untouched.
find "$work" -type l \( -name tsconfig.json -o -name .oxlintrc.json \) -delete
jq --arg config "$types/tsconfig.json" '.extends = $config' \
  "$templates/tsconfig.json" > "$work/tsconfig.json"
jq --argjson modules "$modules" \
  '.rules["no-restricted-imports"][1].patterns[0].group += ($modules | map("!" + .))' \
  "$templates/oxlintrc.json" > "$work/.oxlintrc.json"

cd -- "$work"
oxlint --type-aware --type-check --disable-nested-config --format unix \
  --config .oxlintrc.json .
