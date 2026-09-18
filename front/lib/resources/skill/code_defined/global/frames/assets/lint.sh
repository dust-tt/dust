#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" = 0 ]; then
  echo "Run Frame lint as the sandbox user, not root" >&2
  exit 1
fi

# GCS Fuse makes repeated config reads slow. Cache the skill files on local disk.
checker_cache=${DUST_FRAME_CHECKER_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/dust/frame-checker}
# Bump whenever this script, its configs or bundled rules change to refresh cached checkers.
checker_version=2
checker="$checker_cache/checker-$checker_version"
if [ "$0" != "$checker/lint.sh" ]; then
  if [ ! -f "$checker/lint.sh" ]; then
    templates=$(dirname -- "$0")
    mkdir -p -- "$checker_cache"
    staging=$(mktemp -d "$checker_cache/.copy.XXXXXX")
    trap 'rm -rf -- "$staging"' EXIT
    mkdir "$staging/checker-$checker_version"
    cp -- "$templates/lint.sh" "$templates/tsconfig.json" \
      "$templates/oxlintrc.json" "$templates/frame-rules.cjs" "$staging/checker-$checker_version/"
    # Publish the files together, including when two lint calls start at once.
    if ! mv "$staging/checker-$checker_version" "$checker_cache/"; then
      test -f "$checker/lint.sh"
    fi
    rm -rf -- "$staging"
    trap - EXIT
  fi
  exec bash "$checker/lint.sh" "$@"
fi

templates=$(cd -- "$(dirname -- "$0")" && pwd)
project=$(cd -- "${1:-.}" && pwd)
# Local copies can override the scoped root derived from the /files mount.
frame_root=${DUST_FRAME_ROOT:-${project#/files/}}
frame_root=${frame_root%/}
case "${frame_root%%/*}" in
  conversation-?*|pod-?*) ;;
  *)
    echo "Set DUST_FRAME_ROOT to the scoped Frame folder, for example conversation-abc/MyFrame" >&2
    exit 1
    ;;
esac
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

# Resolve the plugin installed in the image, outside the Frame folder.
tailwind_plugin=$(node -p 'require.resolve(process.argv[1])' "$(npm root --global)/oxlint-tailwindcss")

# Oxlint finds tsconfig beside the source, even with --tsconfig.
# Local directories with source symlinks keep those lookups off GCS Fuse.
work=$(mktemp -d "$cache/.lint.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
cp -Rs -- "$project/." "$work/"
# A read-only source mount must not make the temporary directories read-only.
find "$work" -type d -exec chmod u+w {} +
# List local symlinks before replacing configs, without following them back to GCS Fuse.
lint_config=$(find "$work" -type l -print0 | jq -Rs \
  --arg root "$work/" --arg frameRoot "$frame_root" \
  --arg plugin "$templates/frame-rules.cjs" --argjson modules "$modules" \
  --arg tailwindPlugin "$tailwind_plugin" \
  --slurpfile config "$templates/oxlintrc.json" '
    split("\u0000")[:-1] | map({key: ltrimstr($root), value: true}) | from_entries as $files |
    $config[0] | .jsPlugins[0].specifier = $plugin | .jsPlugins[1] = $tailwindPlugin |
    .rules["dust/relative-package-files"] = ["error", {frameRoot: $frameRoot, packageFiles: $files}] |
    .rules["no-restricted-imports"][1].patterns[0].group += ($modules | map("!" + .))')
# Remove the config symlinks before writing so the originals stay untouched.
find "$work" -type l \( -name tsconfig.json -o -name .oxlintrc.json \) -delete
jq --arg config "$types/tsconfig.json" '.extends = $config' \
  "$templates/tsconfig.json" > "$work/tsconfig.json"
printf '%s\n' "$lint_config" > "$work/.oxlintrc.json"

cd -- "$work"
# Check package paths in backend code too, without loading UI types for those files.
oxlint --allow all --deny dust/relative-package-files \
  --disable-nested-config --format unix --config .oxlintrc.json .
oxlint --type-aware --type-check --disable-nested-config --format unix \
  --allow dust/relative-package-files --ignore-pattern 'functions/**' \
  --ignore-pattern 'databases/**' --config .oxlintrc.json .
