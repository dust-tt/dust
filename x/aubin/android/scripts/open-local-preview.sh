#!/usr/bin/env bash
set -euo pipefail

ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB:-${ANDROID_SDK:+$ANDROID_SDK/platform-tools/adb}}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
ACTIVITY="${ACTIVITY:-.android.MainActivity}"
OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke/local-preview-flow}"
CLEAR_APP_DATA="${CLEAR_APP_DATA:-0}"

if [[ -z "${ADB:-}" || ! -x "$ADB" ]]; then
  echo "ADB was not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or ADB." >&2
  exit 1
fi

has_device() {
  "$ADB" devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'
}

dump_ui() {
  local device_path="$1"
  local output_path="$2"

  for _ in 1 2 3 4 5; do
    if "$ADB" shell uiautomator dump "$device_path" >/dev/null 2>&1; then
      if "$ADB" pull "$device_path" "$output_path" >/dev/null 2>&1 &&
        [[ -s "$output_path" ]] &&
        grep -q '<hierarchy' "$output_path"; then
        return
      fi
    fi
    sleep 1
  done

  echo "Failed to capture a valid UI dump at $output_path" >&2
  exit 1
}

wait_for_dust_activity_ready() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    local windows
    windows="$("$ADB" shell dumpsys window 2>/dev/null | tr -d '\r')"
    if "$ADB" shell pidof "$PACKAGE" >/dev/null 2>&1 &&
      grep -q "mFocusedApp=.*$PACKAGE" <<<"$windows" &&
      ! grep -q "mCurrentFocus=.*Splash Screen $PACKAGE" <<<"$windows"; then
      return
    fi
    sleep 1
  done

  echo "Dust activity did not become ready." >&2
  "$ADB" shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp|Splash Screen' >&2 || true
  exit 1
}

print_latest_texts() {
  local xml_path="$1"
  grep -o 'text="[^"]*"' "$xml_path" | head -n 30 >&2 || true
}

clear_legacy_top_level_artifacts() {
  local parent_dir
  parent_dir="$(dirname "$OUT_DIR")"
  if [[ "$(basename "$OUT_DIR")" == "local-preview-flow" && "$parent_dir" != "." && "$parent_dir" != "/" ]]; then
    find "$parent_dir" -maxdepth 1 -type f -name 'local-preview-*' -exec rm -f {} +
  fi
}

wait_for_text() {
  local text="$1"
  local device_path="$2"
  local output_path="$3"

  for _ in 1 2 3 4 5 6 7 8; do
    wait_for_dust_activity_ready
    dump_ui "$device_path" "$output_path"
    if grep -q "text=\"$text\"" "$output_path"; then
      return
    fi
    sleep 1
  done

  echo "Text '$text' did not appear." >&2
  print_latest_texts "$output_path"
  exit 1
}

if ! has_device; then
  echo "No attached Android device/emulator. Start a visible emulator first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
clear_legacy_top_level_artifacts

"$ADB" wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
"$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
"$ADB" shell am force-stop com.google.android.documentsui >/dev/null 2>&1 || true
"$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
if [[ "$CLEAR_APP_DATA" == "1" ]]; then
  "$ADB" shell pm clear "$PACKAGE" >/dev/null
  sleep 1
fi
"$ADB" logcat -c
"$ADB" shell am start -S -a android.intent.action.VIEW -d "dust://local-preview" -p "$PACKAGE" >/dev/null
wait_for_dust_activity_ready

wait_for_text "Search" /sdcard/dust-local-preview-inbox.xml "$OUT_DIR/local-preview-inbox.xml"

if "$ADB" logcat -d -v time | grep -Ei 'FATAL EXCEPTION|ANR in com\.dust\.mobile|Process com\.dust\.mobile has died|Unable to start activity|Unable to resume activity' >"$OUT_DIR/local-preview-failures.log"; then
  echo "Local preview launch failed. Crash or ANR signatures were written to $OUT_DIR/local-preview-failures.log" >&2
  exit 1
fi

echo "Dust local preview is open."
echo "Artifacts: $OUT_DIR/local-preview-inbox.xml"
