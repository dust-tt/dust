#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB:-${ANDROID_SDK:+$ANDROID_SDK/platform-tools/adb}}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
ACTIVITY="${ACTIVITY:-.android.MainActivity}"
OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke}"

if [[ -z "${ADB:-}" || ! -x "$ADB" ]]; then
  echo "ADB was not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or ADB." >&2
  exit 1
fi

has_device() {
  "$ADB" devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'
}

is_user_unlocked() {
  "$ADB" shell dumpsys user | grep -q 'Started users state: \[0=RUNNING_UNLOCKED\]'
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

print_latest_texts() {
  local xml_path="$1"
  grep -o 'text="[^"]*"' "$xml_path" | head -n 20 >&2 || true
}

close_external_auth_surfaces() {
  "$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
  "$ADB" shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
  sleep 0.3
  "$ADB" shell input keyevent KEYCODE_BACK >/dev/null 2>&1 || true
}

wait_for_login_ui() {
  local device_path="$1"
  local output_path="$2"

  for _ in 1 2 3 4 5 6 7 8; do
    "$ADB" shell am start -n "$PACKAGE/$ACTIVITY" >/dev/null
    dump_ui "$device_path" "$output_path"

    if grep -q 'content-desc="Dust logo"' "$output_path" && grep -q 'text="Sign in"' "$output_path"; then
      if grep -q 'text="Try sample workspace"' "$output_path"; then
        echo "Auth resilience smoke expects prodDebug; the installed app exposes the debug local preview button." >&2
        exit 1
      fi
      return
    fi

    close_external_auth_surfaces
    sleep 1
  done

  echo "Dust login UI did not appear after auth cleanup." >&2
  print_latest_texts "$output_path"
  exit 1
}

tap_text_from_dump() {
  local text="$1"
  local xml_path="$2"
  local bounds

  bounds="$(
    tr '<' '\n' <"$xml_path" | awk -v text="$text" '
      function extract_bounds(line) {
        if (match(line, /bounds="\[[^"]+\]"/)) {
          bounds = substr(line, RSTART, RLENGTH)
          sub(/^bounds="/, "", bounds)
          sub(/"$/, "", bounds)
          return bounds
        }
        return ""
      }

      function print_bounds(bounds) {
        gsub(/[\[\],]/, " ", bounds)
        gsub(/^ +| +$/, "", bounds)
        print bounds
      }

      /clickable="true"/ {
        clickable_bounds = extract_bounds($0)
      }

      index($0, "text=\"" text "\"") {
        text_bounds = extract_bounds($0)
        if (text_bounds != "") {
          print_bounds(text_bounds)
          exit
        }

        if (clickable_bounds != "") {
          print_bounds(clickable_bounds)
          exit
        }
      }
    ' \
      | head -n 1
  )"

  if [[ -z "$bounds" ]]; then
    echo "Could not find tappable text '$text' in $xml_path." >&2
    print_latest_texts "$xml_path"
    exit 1
  fi

  local left top right bottom
  read -r left top right bottom <<<"$bounds"
  "$ADB" shell input tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
}

start_main_activity() {
  close_external_auth_surfaces
  "$ADB" shell am start -S -n "$PACKAGE/$ACTIVITY" >/dev/null
}

read_auth_prefs() {
  "$ADB" shell run-as "$PACKAGE" cat shared_prefs/dust_auth.xml 2>/dev/null || true
}

assert_pending_verifier_present() {
  local prefs="$1"
  if ! grep -q 'name="pending_code_verifier"' <<<"$prefs"; then
    echo "Expected encrypted pending_code_verifier in auth preferences." >&2
    echo "$prefs" >&2
    exit 1
  fi
}

assert_pending_verifier_absent() {
  local prefs="$1"
  if grep -q 'name="pending_code_verifier"' <<<"$prefs"; then
    echo "Expected pending_code_verifier to be cleared." >&2
    echo "$prefs" >&2
    exit 1
  fi
}

wait_for_auth_activity() {
  local output_path="$1"

  for _ in 1 2 3 4 5 6 7 8; do
    "$ADB" shell dumpsys activity activities >"$output_path"
    if grep -q 'https://dust.tt/api/workos/login' "$output_path" &&
      grep -q 'redirect_uri=dust%3A%2F%2Fauth' "$output_path" &&
      grep -q 'screenHint=sign-in' "$output_path"; then
      return
    fi
    sleep 1
  done

  echo "WorkOS sign-in activity did not appear." >&2
  grep -E 'Intent \{|mCurrentFocus|mFocusedApp|topResumedActivity|com\.dust\.mobile|CustomTabActivity|workos' "$output_path" >&2 || true
  exit 1
}

wait_for_pending_verifier_present() {
  for _ in 1 2 3 4 5; do
    local prefs
    prefs="$(read_auth_prefs)"
    if grep -q 'name="pending_code_verifier"' <<<"$prefs"; then
      return
    fi
    sleep 1
  done

  assert_pending_verifier_present "$(read_auth_prefs)"
}

wait_for_pending_verifier_absent() {
  for _ in 1 2 3 4 5; do
    local prefs
    prefs="$(read_auth_prefs)"
    if ! grep -q 'name="pending_code_verifier"' <<<"$prefs"; then
      return
    fi
    sleep 1
  done

  assert_pending_verifier_absent "$(read_auth_prefs)"
}

if ! has_device; then
  echo "No attached Android device/emulator. Run make smoke-samsung-prod-visible first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

"$ADB" wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
"$ADB" shell svc power stayon true >/dev/null 2>&1 || true

if ! is_user_unlocked; then
  echo "Android user 0 is locked. Unlock the visible emulator, then rerun this command." >&2
  "$ADB" shell dumpsys user | grep -E 'State:|Unlock time|Started users state' >&2 || true
  exit 1
fi

"$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
"$ADB" shell pm clear "$PACKAGE" >/dev/null
"$ADB" logcat -c

start_main_activity
wait_for_login_ui /sdcard/dust-auth-resilience-login.xml "$OUT_DIR/auth-resilience-login.xml"

tap_text_from_dump "Sign in" "$OUT_DIR/auth-resilience-login.xml"
wait_for_auth_activity "$OUT_DIR/auth-resilience-sign-in-activities.txt"

wait_for_pending_verifier_present

"$ADB" shell am force-stop "$PACKAGE" >/dev/null
if "$ADB" shell pidof "$PACKAGE" >/dev/null 2>&1; then
  echo "Expected $PACKAGE to be stopped during process-death check." >&2
  exit 1
fi

assert_pending_verifier_present "$(read_auth_prefs)"

"$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
start_main_activity

wait_for_pending_verifier_absent
wait_for_login_ui /sdcard/dust-auth-resilience-final.xml "$OUT_DIR/auth-resilience-final.xml"

if "$ADB" logcat -d -v time | grep -Ei 'FATAL EXCEPTION|ANR in com\.dust\.mobile|Process com\.dust\.mobile has died|Unable to start activity|Unable to resume activity' >"$OUT_DIR/auth-resilience-failures.log"; then
  echo "Auth resilience smoke failed. Crash or ANR signatures were written to $OUT_DIR/auth-resilience-failures.log" >&2
  exit 1
fi

echo "Samsung auth resilience smoke passed."
echo "Artifacts: $OUT_DIR/auth-resilience-login.xml and $OUT_DIR/auth-resilience-final.xml"
