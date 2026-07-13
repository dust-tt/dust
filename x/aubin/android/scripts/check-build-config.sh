#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_CONFIG_DIR="$ROOT_DIR/app/build/generated/source/buildConfig"
MERGED_MANIFEST_DIR="$ROOT_DIR/app/build/intermediates/merged_manifest"

assert_config_value() {
  local variant="$1"
  local key="$2"
  local expected="$3"
  local path="$BUILD_CONFIG_DIR/$variant/com/dust/mobile/android/BuildConfig.java"

  if [[ ! -f "$path" ]]; then
    echo "Missing generated BuildConfig for $variant. Run the Gradle build before this check." >&2
    exit 1
  fi

  if ! grep -q "public static final .* $key = $expected;" "$path"; then
    echo "Unexpected $key for $variant. Expected $expected in $path." >&2
    exit 1
  fi
}

manifest_path_for_variant() {
  case "$1" in
    debug) echo "$MERGED_MANIFEST_DIR/debug/processDebugMainManifest/AndroidManifest.xml" ;;
    prodDebug) echo "$MERGED_MANIFEST_DIR/prodDebug/processProdDebugMainManifest/AndroidManifest.xml" ;;
    release) echo "$MERGED_MANIFEST_DIR/release/processReleaseMainManifest/AndroidManifest.xml" ;;
    *)
      echo "Unknown variant '$1'." >&2
      exit 1
      ;;
  esac
}

assert_manifest_contains() {
  local variant="$1"
  local expected="$2"
  local path
  path="$(manifest_path_for_variant "$variant")"

  if [[ ! -f "$path" ]]; then
    echo "Missing merged manifest for $variant. Run the manifest processing task before this check." >&2
    exit 1
  fi

  if ! grep -q "$expected" "$path"; then
    echo "Expected '$expected' in merged manifest for $variant at $path." >&2
    exit 1
  fi
}

assert_manifest_not_contains() {
  local variant="$1"
  local unexpected="$2"
  local path
  path="$(manifest_path_for_variant "$variant")"

  if [[ ! -f "$path" ]]; then
    echo "Missing merged manifest for $variant. Run the manifest processing task before this check." >&2
    exit 1
  fi

  if grep -q "$unexpected" "$path"; then
    echo "Unexpected '$unexpected' in merged manifest for $variant at $path." >&2
    exit 1
  fi
}

assert_config_value "debug" "DUST_API_BASE_URL" '"http://10.0.2.2:3000"'
assert_config_value "debug" "DUST_APP_URL" '"http://10.0.2.2:3000"'
assert_config_value "debug" "LOCAL_AUTH_BYPASS_ENABLED" "true"
assert_config_value "debug" "LOCAL_AUTH_BYPASS_BUTTON_ENABLED" "true"
assert_manifest_contains "debug" 'android:host="local-preview"'

assert_config_value "prodDebug" "DUST_API_BASE_URL" '"https://dust.tt"'
assert_config_value "prodDebug" "DUST_APP_URL" '"https://app.dust.tt"'
assert_config_value "prodDebug" "LOCAL_AUTH_BYPASS_ENABLED" "true"
assert_config_value "prodDebug" "LOCAL_AUTH_BYPASS_BUTTON_ENABLED" "false"
assert_manifest_contains "prodDebug" 'android:host="local-preview"'

assert_config_value "release" "DUST_API_BASE_URL" '"https://dust.tt"'
assert_config_value "release" "DUST_APP_URL" '"https://app.dust.tt"'
assert_config_value "release" "LOCAL_AUTH_BYPASS_ENABLED" "false"
assert_config_value "release" "LOCAL_AUTH_BYPASS_BUTTON_ENABLED" "false"
assert_manifest_not_contains "release" 'android:host="local-preview"'

echo "Dust Android build variants use the expected URLs, auth-bypass flags, and local-preview deep links."
