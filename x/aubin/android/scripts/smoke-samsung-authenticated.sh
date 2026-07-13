#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB:-${ANDROID_SDK:+$ANDROID_SDK/platform-tools/adb}}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
ACTIVITY="${ACTIVITY:-.android.MainActivity}"
OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke}"
AUTH_TIMEOUT_SECONDS="${AUTH_TIMEOUT_SECONDS:-420}"
AUTO_START_SIGN_IN="${AUTO_START_SIGN_IN:-1}"
SIZE="${SAMSUNG_SIZE:-1080x2340}"
DENSITY="${SAMSUNG_DENSITY:-425}"
CONFIGURE_VIEWPORT="${CONFIGURE_VIEWPORT:-1}"
PREFLIGHT_ONLY="${PREFLIGHT_ONLY:-0}"
PREFLIGHT_SETTLE_SECONDS="${PREFLIGHT_SETTLE_SECONDS:-10}"

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

wake_and_dismiss_keyguard() {
  "$ADB" shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  "$ADB" shell input keyevent 224 >/dev/null 2>&1 || true
  "$ADB" shell wm dismiss-keyguard >/dev/null 2>&1 || true
  "$ADB" shell input keyevent 82 >/dev/null 2>&1 || true
  "$ADB" shell input swipe 540 1800 540 500 300 >/dev/null 2>&1 || true
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

capture_screen() {
  local name="$1"
  "$ADB" shell screencap -p "/sdcard/dust-$name.png"
  "$ADB" pull "/sdcard/dust-$name.png" "$OUT_DIR/$name.png" >/dev/null
}

capture_timeout_context() {
  local xml_path="$1"
  local timeout_xml="$OUT_DIR/authenticated-timeout.xml"

  if [[ -s "$xml_path" ]]; then
    cp "$xml_path" "$timeout_xml"
  fi

  if "$ADB" shell screencap -p /sdcard/dust-authenticated-timeout.png >/dev/null 2>&1 &&
    "$ADB" pull /sdcard/dust-authenticated-timeout.png "$OUT_DIR/authenticated-timeout.png" >/dev/null 2>&1; then
    echo "Timeout screenshot: $OUT_DIR/authenticated-timeout.png" >&2
  fi
  if [[ -f "$timeout_xml" ]]; then
    echo "Timeout UI dump: $timeout_xml" >&2
  fi
}

clear_authenticated_working_context() {
  rm -f "$OUT_DIR/authenticated-current.xml"
}

clear_stale_authenticated_context() {
  clear_authenticated_working_context
  rm -f "$OUT_DIR/authenticated-timeout.png" "$OUT_DIR/authenticated-timeout.xml"
}

capture_stable_screen() {
  local name="$1"
  local device_xml="$2"
  local host_xml="$3"
  local readiness_pattern="$4"

  sleep 1
  dump_ui "$device_xml" "$host_xml"
  if ! grep -q "$readiness_pattern" "$host_xml"; then
    echo "Screen '$name' was not stable for '$readiness_pattern'." >&2
    print_latest_texts "$host_xml"
    exit 1
  fi
  capture_screen "$name"
}

current_device_size() {
  "$ADB" shell wm size | tr -d '\r' | awk -F': ' '
    /Override size:/ { size = $2 }
    /Physical size:/ && size == "" { size = $2 }
    END { print size }
  '
}

current_device_density() {
  "$ADB" shell wm density | tr -d '\r' | awk -F': ' '
    /Override density:/ { density = $2 }
    /Physical density:/ && density == "" { density = $2 }
    END { print density }
  '
}

configure_samsung_viewport() {
  if [[ "$CONFIGURE_VIEWPORT" == "1" ]]; then
    "$ADB" shell wm size "$SIZE"
    "$ADB" shell wm density "$DENSITY"
  fi

  local actual_size
  local actual_density
  actual_size="$(current_device_size)"
  actual_density="$(current_device_density)"
  if [[ "$actual_size" != "$SIZE" || "$actual_density" != "$DENSITY" ]]; then
    echo "Expected Samsung viewport $SIZE @ $DENSITY dpi, got ${actual_size:-unknown} @ ${actual_density:-unknown} dpi." >&2
    echo "Run make smoke-samsung-prod-visible first, or set CONFIGURE_VIEWPORT=1 for this helper." >&2
    exit 1
  fi
}

start_main_activity() {
  "$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
  "$ADB" shell am start -S -n "$PACKAGE/$ACTIVITY" >/dev/null
}

print_latest_texts() {
  local xml_path="$1"
  grep -o 'text="[^"]*"' "$xml_path" | head -n 20 >&2 || true
}

is_local_preview_dump() {
  local xml_path="$1"
  grep -q 'package="com.dust.mobile"' "$xml_path" &&
    grep -q 'text="Sample workspace"' "$xml_path"
}

is_authenticating_dump() {
  local xml_path="$1"
  grep -q 'package="com.dust.mobile"' "$xml_path" &&
    grep -q 'text="Opening secure sign-in"' "$xml_path"
}

is_login_dump() {
  local xml_path="$1"
  grep -q 'package="com.dust.mobile"' "$xml_path" &&
    grep -q 'text="Sign in"' "$xml_path"
}

is_authenticated_inbox_dump() {
  local xml_path="$1"
  grep -q 'package="com.dust.mobile"' "$xml_path" &&
    grep -q 'text="Search conversations"' "$xml_path" &&
    grep -q 'content-desc="Account menu"' "$xml_path"
}

assert_authenticated_compose_controls() {
  grep -q 'text="Ask anything or call an agent with @"' "$OUT_DIR/authenticated-compose.xml"
  grep -q 'text="Dust"' "$OUT_DIR/authenticated-compose.xml"
  grep -q 'content-desc="Add context"' "$OUT_DIR/authenticated-compose.xml"
  grep -q 'content-desc="Voice input"' "$OUT_DIR/authenticated-compose.xml"
  if grep -q 'content-desc="Send"\|text="Quick starts"\|text="Draft customer brief"' \
    "$OUT_DIR/authenticated-compose.xml"; then
    echo "Authenticated empty compose should use the compact iOS-style composer state." >&2
    exit 1
  fi
}

assert_authenticated_account_menu_visible() {
  grep -q 'content-desc="Account menu"' "$OUT_DIR/authenticated-inbox.xml"
  grep -q 'text="Sign out"' "$OUT_DIR/authenticated-account-menu.xml"
}

reset_stale_preflight_auth_state() {
  echo "Preflight found stale pending auth. Clearing local app state and reopening prod login." >&2
  "$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
  "$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
  "$ADB" shell pm clear "$PACKAGE" >/dev/null
  start_main_activity
  sleep 2
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
        if (clickable_bounds != "") {
          print_bounds(clickable_bounds)
          exit
        }

        text_bounds = extract_bounds($0)
        if (text_bounds != "") {
          print_bounds(text_bounds)
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

tap_content_desc_from_dump() {
  local description="$1"
  local xml_path="$2"
  local bounds

  bounds="$(
    tr '<' '\n' <"$xml_path" | sed -n -E \
      "/content-desc=\"$description\"/s/.*bounds=\"\\[([0-9]+),([0-9]+)\\]\\[([0-9]+),([0-9]+)\\]\".*/\\1 \\2 \\3 \\4/p" \
      | head -n 1
  )"

  if [[ -z "$bounds" ]]; then
    echo "Could not find tappable content description '$description' in $xml_path." >&2
    print_latest_texts "$xml_path"
    exit 1
  fi

  local left top right bottom
  read -r left top right bottom <<<"$bounds"
  "$ADB" shell input tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
}

wait_for_authenticated_inbox() {
  local xml_path="$OUT_DIR/authenticated-current.xml"
  local deadline=$((SECONDS + AUTH_TIMEOUT_SECONDS))
  local sign_in_started=0

  echo "Waiting up to ${AUTH_TIMEOUT_SECONDS}s for a real authenticated Dust inbox." >&2
  echo "Complete WorkOS auth in the visible emulator. Set AUTO_START_SIGN_IN=0 to start sign-in manually." >&2

  while [[ "$SECONDS" -lt "$deadline" ]]; do
    dump_ui /sdcard/dust-authenticated-current.xml "$xml_path"

    if is_local_preview_dump "$xml_path"; then
      echo "Local preview is open, not a real authenticated workspace." >&2
      echo "Run make smoke-samsung-prod-visible to reset to the prod login flow, then rerun this helper." >&2
      exit 1
    fi

    if grep -q 'package="com.dust.mobile"' "$xml_path" &&
      grep -q 'text="Inbox"' "$xml_path" &&
      grep -q 'text="Search conversations"' "$xml_path" &&
      ! grep -q 'text="Sign in"' "$xml_path"; then
      capture_stable_screen authenticated-inbox /sdcard/dust-authenticated-current.xml "$xml_path" 'text="Search conversations"'
      if is_local_preview_dump "$xml_path"; then
        echo "Local preview is open, not a real authenticated workspace." >&2
        echo "Run make smoke-samsung-prod-visible to reset to the prod login flow, then rerun this helper." >&2
        exit 1
      fi
      cp "$xml_path" "$OUT_DIR/authenticated-inbox.xml"
      return
    fi

    if [[ "$AUTO_START_SIGN_IN" == "1" && "$sign_in_started" == "0" ]] &&
      grep -q 'content-desc="Dust logo"' "$xml_path" &&
      grep -q 'text="Sign in"' "$xml_path"; then
      echo "Opening prod sign-in. Complete WorkOS auth in the visible emulator." >&2
      tap_text_from_dump "Sign in" "$xml_path"
      sign_in_started=1
    fi

    sleep 3
  done

  echo "Timed out waiting for an authenticated Dust inbox." >&2
  echo "Run with AUTH_TIMEOUT_SECONDS=<seconds> for a longer manual sign-in window." >&2
  capture_timeout_context "$xml_path"
  "$ADB" shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' >&2 || true
  echo "Latest visible texts:" >&2
  print_latest_texts "$xml_path"
  exit 1
}

run_preflight() {
  local xml_path="$OUT_DIR/authenticated-preflight.xml"
  local deadline=$((SECONDS + PREFLIGHT_SETTLE_SECONDS))

  while [[ "$SECONDS" -le "$deadline" ]]; do
    dump_ui /sdcard/dust-authenticated-preflight.xml "$xml_path"

    if is_local_preview_dump "$xml_path"; then
      echo "Local preview is open, not a real authenticated workspace." >&2
      echo "Run make smoke-samsung-prod-visible to reset to the prod login flow, then rerun this helper." >&2
      exit 1
    fi

    if is_login_dump "$xml_path"; then
      capture_stable_screen authenticated-preflight /sdcard/dust-authenticated-preflight.xml "$xml_path" 'text="Sign in"'
      echo "Authenticated smoke preflight passed. Prod sign-in is ready on the Samsung viewport."
      echo "Artifacts: $OUT_DIR/authenticated-preflight.png and $OUT_DIR/authenticated-preflight.xml"
      return
    fi

    if is_authenticated_inbox_dump "$xml_path"; then
      capture_stable_screen authenticated-preflight /sdcard/dust-authenticated-preflight.xml "$xml_path" 'text="Search conversations"'
      echo "Authenticated smoke preflight passed. A signed-in inbox is already visible on the Samsung viewport."
      echo "Artifacts: $OUT_DIR/authenticated-preflight.png and $OUT_DIR/authenticated-preflight.xml"
      return
    fi

    sleep 1
  done

  if is_authenticating_dump "$xml_path"; then
    reset_stale_preflight_auth_state
    deadline=$((SECONDS + PREFLIGHT_SETTLE_SECONDS))
    while [[ "$SECONDS" -le "$deadline" ]]; do
      dump_ui /sdcard/dust-authenticated-preflight.xml "$xml_path"

      if is_login_dump "$xml_path"; then
        capture_stable_screen authenticated-preflight /sdcard/dust-authenticated-preflight.xml "$xml_path" 'text="Sign in"'
        echo "Authenticated smoke preflight passed. Prod sign-in is ready on the Samsung viewport."
        echo "Artifacts: $OUT_DIR/authenticated-preflight.png and $OUT_DIR/authenticated-preflight.xml"
        return
      fi

      if is_authenticated_inbox_dump "$xml_path"; then
        capture_stable_screen authenticated-preflight /sdcard/dust-authenticated-preflight.xml "$xml_path" 'text="Search conversations"'
        echo "Authenticated smoke preflight passed. A signed-in inbox is already visible on the Samsung viewport."
        echo "Artifacts: $OUT_DIR/authenticated-preflight.png and $OUT_DIR/authenticated-preflight.xml"
        return
      fi

      sleep 1
    done
  fi

  echo "Authenticated smoke preflight could not identify login or signed-in inbox." >&2
  echo "Latest visible texts:" >&2
  print_latest_texts "$xml_path"
  exit 1
}

write_artifact_manifest() {
  local manifest="$OUT_DIR/authenticated-artifacts.txt"
  local review_html="$OUT_DIR/authenticated-review.html"
  local generated_at
  local device_size
  local device_density

  generated_at="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  device_size="$(current_device_size)"
  device_density="$(current_device_density)"

  cat >"$review_html" <<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dust Android authenticated smoke</title>
  <style>
    :root {
      color-scheme: light;
      --background: #f7f6f2;
      --surface: #ffffff;
      --border: #d7d3cb;
      --text: #171717;
      --muted: #6f6b64;
      --chip: #efede7;
    }
    body {
      margin: 0;
      background: var(--background);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.15;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 15px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0 24px;
      padding: 0;
      list-style: none;
    }
    .meta li {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--chip);
      font-size: 13px;
      line-height: 1.2;
      padding: 7px 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
      align-items: start;
    }
    figure {
      margin: 0;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    figcaption {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      font-weight: 650;
    }
    img {
      display: block;
      width: 100%;
      max-height: 760px;
      height: auto;
      object-fit: contain;
      background: #fff;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Dust Android authenticated smoke</h1>
      <p>Samsung-sized screenshots from a manually completed WorkOS session.</p>
      <ul class="meta" aria-label="Run metadata">
        <li>Generated: $generated_at</li>
        <li>Device: ${device_size:-unknown} @ ${device_density:-unknown} dpi</li>
        <li>Variant: installed prodDebug</li>
        <li>URLs: https://dust.tt + https://app.dust.tt</li>
      </ul>
    </header>
    <section class="grid">
      <figure>
        <figcaption>Authenticated inbox</figcaption>
        <img src="authenticated-inbox.png" alt="Authenticated inbox">
      </figure>
      <figure>
        <figcaption>Account menu</figcaption>
        <img src="authenticated-account-menu.png" alt="Authenticated account menu">
      </figure>
      <figure>
        <figcaption>New conversation</figcaption>
        <img src="authenticated-compose.png" alt="Authenticated new conversation">
      </figure>
    </section>
  </main>
</body>
</html>
HTML

  {
    echo "Dust Android authenticated Samsung smoke artifacts"
    echo "Generated: $generated_at"
    echo "Device: ${device_size:-unknown} @ ${device_density:-unknown} dpi"
    echo "Variant: installed prodDebug"
    echo "URLs: https://dust.tt + https://app.dust.tt"
    echo
    echo "Review page:"
    echo "- $review_html"
    echo
    echo "Review screenshots:"
    echo "- Inbox: $OUT_DIR/authenticated-inbox.png"
    echo "- Account menu: $OUT_DIR/authenticated-account-menu.png"
    echo "- New conversation: $OUT_DIR/authenticated-compose.png"
    echo
    echo "Machine-check UI dumps:"
    echo "- Inbox: $OUT_DIR/authenticated-inbox.xml"
    echo "- Account menu: $OUT_DIR/authenticated-account-menu.xml"
    echo "- New conversation: $OUT_DIR/authenticated-compose.xml"
    echo
    echo "Notes:"
    echo "- authenticated-failures.log is empty on success."
  } >"$manifest"
}

if ! has_device; then
  echo "No attached Android device/emulator. Run make smoke-samsung-prod-visible first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
clear_stale_authenticated_context
trap clear_authenticated_working_context EXIT

"$ADB" wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
"$ADB" shell svc power stayon true >/dev/null 2>&1 || true

if ! is_user_unlocked; then
  wake_and_dismiss_keyguard
  sleep 2
fi

if ! is_user_unlocked; then
  echo "Android user 0 is locked. Unlock the visible emulator, then rerun this command." >&2
  "$ADB" shell dumpsys user | grep -E 'State:|Unlock time|Started users state' >&2 || true
  exit 1
fi

configure_samsung_viewport
start_main_activity
sleep 2
if [[ "$PREFLIGHT_ONLY" == "1" ]]; then
  run_preflight
  exit 0
fi

wait_for_authenticated_inbox
tap_content_desc_from_dump "Account menu" "$OUT_DIR/authenticated-inbox.xml"
capture_stable_screen authenticated-account-menu /sdcard/dust-authenticated-account-menu.xml "$OUT_DIR/authenticated-account-menu.xml" 'text="Sign out"'
assert_authenticated_account_menu_visible
"$ADB" shell input keyevent KEYCODE_BACK
sleep 1

tap_content_desc_from_dump "New conversation" "$OUT_DIR/authenticated-inbox.xml"
capture_stable_screen authenticated-compose /sdcard/dust-authenticated-compose.xml "$OUT_DIR/authenticated-compose.xml" 'text="Ask anything or call an agent with @"'
grep -q 'text="Ask anything or call an agent with @"' "$OUT_DIR/authenticated-compose.xml"
assert_authenticated_compose_controls

if "$ADB" logcat -d -v time | grep -Ei 'FATAL EXCEPTION|ANR in com\.dust\.mobile|Process com\.dust\.mobile has died|Unable to start activity|Unable to resume activity' >"$OUT_DIR/authenticated-failures.log"; then
  echo "Authenticated smoke failed. Crash or ANR signatures were written to $OUT_DIR/authenticated-failures.log" >&2
  exit 1
fi

write_artifact_manifest
echo "Authenticated Samsung smoke passed."
echo "Artifacts: $OUT_DIR/authenticated-inbox.png, $OUT_DIR/authenticated-account-menu.png, and $OUT_DIR/authenticated-compose.png"
echo "Review page: $OUT_DIR/authenticated-review.html"
