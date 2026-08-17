#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB:-${ANDROID_SDK:+$ANDROID_SDK/platform-tools/adb}}"
EMULATOR="${EMULATOR:-${ANDROID_SDK:+$ANDROID_SDK/emulator/emulator}}"
AVD="${AVD:-DustSamsungS23}"
SYSTEM_IMAGE="${SYSTEM_IMAGE:-system-images;android-35;google_apis;arm64-v8a}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
ACTIVITY="${ACTIVITY:-.android.MainActivity}"
SIZE="${SAMSUNG_SIZE:-1080x2340}"
DENSITY="${SAMSUNG_DENSITY:-425}"
OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke}"
DEVICE_READY_TIMEOUT_SECONDS="${DEVICE_READY_TIMEOUT_SECONDS:-90}"
APK="$ROOT_DIR/app/build/outputs/apk/prodDebug/app-prodDebug.apk"

if [[ -z "${ADB:-}" || ! -x "$ADB" ]]; then
  echo "ADB was not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or ADB." >&2
  exit 1
fi

started_emulator=0

cleanup() {
  if [[ "$started_emulator" == "1" && "${KEEP_EMULATOR:-0}" != "1" ]]; then
    "$ADB" emu kill >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

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

wait_for_device_ready() {
  "$ADB" wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'

  "$ADB" shell svc power stayon true >/dev/null 2>&1 || true

  local waited_seconds=0
  while [[ "$waited_seconds" -lt "$DEVICE_READY_TIMEOUT_SECONDS" ]]; do
    if is_user_unlocked; then
      return
    fi

    wake_and_dismiss_keyguard
    sleep 2
    waited_seconds=$((waited_seconds + 2))
  done

  echo "Android boot completed, but user 0 did not reach RUNNING_UNLOCKED." >&2
  echo "If this is a stale emulator, retry with FRESH_AVD=1 or run make smoke-samsung-prod-visible-fresh." >&2
  "$ADB" shell dumpsys user | grep -E 'State:|Unlock time|Started users state' >&2 || true
  exit 1
}

start_emulator() {
  local emulator_args=("$@")
  local log_path="/tmp/dust-android-emulator.log"

  if [[ "${KEEP_EMULATOR:-0}" == "1" && "${VISIBLE:-0}" == "1" ]] && command -v tmux >/dev/null; then
    local session="dust-android-$AVD-$$"
    local command
    local quoted
    printf -v command 'exec %q' "$EMULATOR"
    for arg in "${emulator_args[@]}"; do
      printf -v quoted ' %q' "$arg"
      command+="$quoted"
    done
    printf -v quoted '%q' "$log_path"
    command+=" >$quoted 2>&1"
    tmux new-session -d -s "$session" -c "$ROOT_DIR" "$command"
    return
  fi

  if [[ "${KEEP_EMULATOR:-0}" == "1" ]]; then
    nohup "$EMULATOR" "${emulator_args[@]}" >"$log_path" 2>&1 &
  else
    "$EMULATOR" "${emulator_args[@]}" >"$log_path" 2>&1 &
  fi
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

start_main_activity() {
  "$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
  "$ADB" shell am start -S -n "$PACKAGE/$ACTIVITY" >/dev/null
}

wait_for_main_activity_ready() {
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

  echo "Dust main activity did not become ready." >&2
  "$ADB" shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp|Splash Screen' >&2 || true
  exit 1
}

wait_for_demo_activity_ready() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    local windows
    windows="$("$ADB" shell dumpsys window 2>/dev/null | tr -d '\r')"
    if { grep -Fq "$PACKAGE/.android.DemoPresentationActivity" <<<"$windows" ||
      grep -Fq "$PACKAGE/com.dust.mobile.android.DemoPresentationActivity" <<<"$windows"; } &&
      ! grep -q "mCurrentFocus=.*Splash Screen $PACKAGE" <<<"$windows"; then
      return
    fi
    sleep 1
  done

  echo "Demo presentation activity did not become ready." >&2
  "$ADB" shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp|Splash Screen' >&2 || true
  exit 1
}

demo_screen_expected_text() {
  case "$1" in
    loading) echo "Loading Dust" ;;
    session-expired) echo "Your session expired. Sign in again to continue." ;;
    inbox-loading) echo "Revenue Team" ;;
    inbox) echo "Revenue Team" ;;
    empty-inbox) echo "No conversations yet" ;;
    compose) echo "Ask anything or call an agent with @" ;;
    detail) echo "Briefing" ;;
    thinking) echo "Thinking..." ;;
    streaming) echo "Streaming" ;;
    files) echo "customer-briefing.pdf" ;;
    *)
      echo "Unknown demo screen: $1" >&2
      exit 1
      ;;
  esac
}

wait_for_demo_screen_text() {
  local screen="$1"
  local expected="$2"
  local device_xml="/sdcard/dust-demo-$screen.xml"
  local host_xml="$OUT_DIR/demo-$screen.xml"

  for _ in 1 2 3 4 5 6 7 8; do
    wait_for_demo_activity_ready
    dump_ui "$device_xml" "$host_xml"
    if grep -q "text=\"$expected\"" "$host_xml"; then
      return
    fi
    sleep 1
  done

  echo "Demo screen '$screen' did not render expected text '$expected'." >&2
  print_latest_texts "$host_xml"
  exit 1
}

assert_text_top_at_least() {
  local text="$1"
  local xml_path="$2"
  local min_top="$3"
  local top

  top="$(
    tr '<' '\n' <"$xml_path" | sed -n -E \
      "/text=\"$text\"/s/.*bounds=\"\[[0-9]+,([0-9]+)\]\[[0-9]+,[0-9]+\]\".*/\1/p" \
      | head -n 1
  )"

  if [[ -z "$top" ]]; then
    echo "Could not find text '$text' in $xml_path." >&2
    print_latest_texts "$xml_path"
    exit 1
  fi

  if [[ "$top" -lt "$min_top" ]]; then
    echo "Text '$text' is too close to the status bar in $xml_path: top=$top, expected >= $min_top." >&2
    exit 1
  fi
}

assert_only_avatar_description() {
  local xml_path="$1"
  local allowed_description="$2"
  local avatar_description

  while IFS= read -r avatar_description; do
    [[ -z "$avatar_description" ]] && continue
    if [[ "$avatar_description" != "content-desc=\"$allowed_description\"" ]]; then
      echo "Unexpected avatar on demo screen: $avatar_description" >&2
      exit 1
    fi
  done < <(grep -oE 'content-desc="[^"]+ avatar"' "$xml_path" || true)
}

capture_login_ui() {
  local capture_png="${1:-1}"
  local device_xml="/sdcard/dust-login.xml"
  local device_png="/sdcard/dust-login.png"
  local host_xml="$OUT_DIR/login.xml"
  local host_png="$OUT_DIR/login.png"

  for _ in 1 2 3 4 5 6 7 8; do
    dump_ui "$device_xml" "$host_xml"

    if grep -q 'content-desc="Dust logo"' "$host_xml" &&
      grep -q 'text="Sign in"' "$host_xml" &&
      grep -q 'text="Sign up"' "$host_xml"; then
      wait_for_main_activity_ready
      sleep 1
      dump_ui "$device_xml" "$host_xml"
      if ! grep -q 'content-desc="Dust logo"' "$host_xml" ||
        ! grep -q 'text="Sign in"' "$host_xml" ||
        ! grep -q 'text="Sign up"' "$host_xml"; then
        continue
      fi
      if [[ "$capture_png" == "1" ]]; then
        "$ADB" shell screencap -p "$device_png"
        "$ADB" pull "$device_png" "$host_png" >/dev/null
      fi
      return
    fi

    if grep -q 'package="com.android.chrome"' "$host_xml"; then
      start_main_activity
    fi

    sleep 1
  done

  echo "Dust login UI did not appear. Last UI dump is at $host_xml and screenshot is at $host_png." >&2
  exit 1
}

clear_stale_helper_artifacts() {
  rm -f "$OUT_DIR"/auth-resilience-* "$OUT_DIR"/current-prod-login.* "$OUT_DIR/pkce-login.xml"
}

print_latest_texts() {
  local xml_path="$1"
  grep -o 'text="[^"]*"' "$xml_path" | grep -v '^text=""$' | head -n 30 >&2 || true
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

wait_for_workos_activity() {
  local screen_hint="$1"
  local output_path="$2"

  for _ in 1 2 3 4 5 6 7 8; do
    "$ADB" shell dumpsys activity activities >"$output_path"
    if grep -q 'https://dust.tt/api/workos/login' "$output_path" &&
      grep -q 'redirect_uri=dust%3A%2F%2Fauth' "$output_path" &&
      grep -q "screenHint=$screen_hint" "$output_path"; then
      return 0
    fi
    sleep 1
  done

  return 1
}

open_workos_from_login() {
  local label="$1"
  local screen_hint="$2"
  local output_path="$3"

  for attempt in 1 2; do
    capture_login_ui 0
    tap_text_from_dump "$label" "$OUT_DIR/login.xml"
    if wait_for_workos_activity "$screen_hint" "$output_path"; then
      return
    fi

    if [[ "$attempt" == "1" ]]; then
      start_main_activity
      sleep 2
    fi
  done

  echo "$label did not open the expected WorkOS screenHint=$screen_hint URL." >&2
  echo "Last activity dump: $output_path" >&2
  print_latest_texts "$OUT_DIR/login.xml"
  exit 1
}

write_artifact_manifest() {
  local manifest="$OUT_DIR/prod-artifacts.txt"
  local review_html="$OUT_DIR/prod-review.html"
  local generated_at
  local device_size
  local device_density

  generated_at="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  device_size="$(
    "$ADB" shell wm size | tr -d '\r' | awk -F': ' '
      /Override size:/ { size = $2 }
      /Physical size:/ && size == "" { size = $2 }
      END { print size }
    '
  )"
  device_density="$(
    "$ADB" shell wm density | tr -d '\r' | awk -F': ' '
      /Override density:/ { density = $2 }
      /Physical density:/ && density == "" { density = $2 }
      END { print density }
    '
  )"

  cat >"$review_html" <<HTML
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dust Android production smoke</title>
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
      max-width: 1440px;
      margin: 0 auto;
      padding: 32px;
    }
    header {
      margin-bottom: 24px;
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
      margin: 16px 0 0;
      padding: 0;
      list-style: none;
    }
    .meta li {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--chip);
      color: var(--text);
      font-size: 13px;
      line-height: 1.2;
      padding: 7px 10px;
    }
    .checks {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
    }
    .checks li {
      border-left: 3px solid var(--text);
      color: var(--muted);
      font-size: 13px;
      line-height: 1.35;
      padding-left: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
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
      <h1>Dust Android production smoke</h1>
      <p>Samsung-sized screenshots and checks from the production-targeted login flow.</p>
      <ul class="meta" aria-label="Run metadata">
        <li>Generated: $generated_at</li>
        <li>Device: ${device_size:-unknown} @ ${device_density:-unknown} dpi</li>
        <li>Variant: prodDebug</li>
        <li>URLs: https://dust.tt + https://app.dust.tt</li>
      </ul>
      <ul class="checks" aria-label="Smoke checks">
        <li>Login screen renders with the canonical Dust logo.</li>
        <li>Frame share links show the sign-in gate.</li>
        <li>Sign in and sign up open WorkOS with the Android callback URL.</li>
        <li>Crash, ANR, and activity-start log signatures are checked.</li>
      </ul>
    </header>
    <section class="grid">
      <figure>
        <figcaption>Production login</figcaption>
        <img src="login.png" alt="Production login screen">
      </figure>
      <figure>
        <figcaption>Shared frame sign-in gate</figcaption>
        <img src="frame-login.png" alt="Shared frame sign-in gate">
      </figure>
HTML

  if [[ "${CAPTURE_DEMO_UI:-0}" == "1" ]]; then
    cat >>"$review_html" <<HTML
      <figure>
        <figcaption>Demo loading</figcaption>
        <img src="demo-loading.png" alt="Demo loading screen">
      </figure>
      <figure>
        <figcaption>Demo session expired</figcaption>
        <img src="demo-session-expired.png" alt="Demo session expired screen">
      </figure>
      <figure>
        <figcaption>Demo inbox</figcaption>
        <img src="demo-inbox.png" alt="Demo inbox screen">
      </figure>
      <figure>
        <figcaption>Demo inbox loading</figcaption>
        <img src="demo-inbox-loading.png" alt="Demo inbox loading screen">
      </figure>
      <figure>
        <figcaption>Demo empty inbox</figcaption>
        <img src="demo-empty-inbox.png" alt="Demo empty inbox screen">
      </figure>
      <figure>
        <figcaption>Demo compose</figcaption>
        <img src="demo-compose.png" alt="Demo compose screen">
      </figure>
      <figure>
        <figcaption>Demo detail</figcaption>
        <img src="demo-detail.png" alt="Demo detail screen">
      </figure>
      <figure>
        <figcaption>Demo thinking</figcaption>
        <img src="demo-thinking.png" alt="Demo thinking screen">
      </figure>
      <figure>
        <figcaption>Demo answer streaming</figcaption>
        <img src="demo-streaming.png" alt="Demo streaming screen">
      </figure>
      <figure>
        <figcaption>Demo files</figcaption>
        <img src="demo-files.png" alt="Demo files screen">
      </figure>
HTML
  fi

  cat >>"$review_html" <<HTML
    </section>
  </main>
</body>
</html>
HTML

  {
    echo "Dust Android production smoke artifacts"
    echo "Generated: $generated_at"
    echo "Device: ${device_size:-unknown} @ ${device_density:-unknown} dpi"
    echo "Variant: prodDebug"
    echo "URLs: https://dust.tt + https://app.dust.tt"
    echo
    echo "Review page:"
    echo "- $review_html"
    echo
    echo "Review screenshots:"
    echo "- Login: $OUT_DIR/login.png"
    echo "- Shared frame sign-in gate: $OUT_DIR/frame-login.png"
    if [[ "${CAPTURE_DEMO_UI:-0}" == "1" ]]; then
      echo "- Demo loading: $OUT_DIR/demo-loading.png"
      echo "- Demo session expired: $OUT_DIR/demo-session-expired.png"
      echo "- Demo inbox: $OUT_DIR/demo-inbox.png"
      echo "- Demo inbox loading: $OUT_DIR/demo-inbox-loading.png"
      echo "- Demo empty inbox: $OUT_DIR/demo-empty-inbox.png"
      echo "- Demo compose: $OUT_DIR/demo-compose.png"
      echo "- Demo detail: $OUT_DIR/demo-detail.png"
      echo "- Demo thinking: $OUT_DIR/demo-thinking.png"
      echo "- Demo streaming: $OUT_DIR/demo-streaming.png"
      echo "- Demo files: $OUT_DIR/demo-files.png"
    fi
    echo
    echo "Machine-check artifacts:"
    echo "- Login UI: $OUT_DIR/login.xml"
    echo "- Frame login UI: $OUT_DIR/frame-login.xml"
    echo "- Sign up activity dump: $OUT_DIR/sign-up-activities.txt"
    echo "- Sign in activity dump: $OUT_DIR/sign-in-activities.txt"
    echo "- After-back UI: $OUT_DIR/after-back.xml"
    echo "- failures.log is empty on success."
    if [[ "${CAPTURE_DEMO_UI:-0}" == "1" ]]; then
      echo "- demo-copy-leaks.log is empty on success."
    fi
  } >"$manifest"
}

set_avd_config() {
  local key="$1"
  local value="$2"
  local config="$HOME/.android/avd/$AVD.avd/config.ini"
  local tmp
  tmp="$(mktemp)"
  awk -F= -v key="$key" -v value="$value" '
    BEGIN { written = 0 }
    $1 == key { print key "=" value; written = 1; next }
    { print }
    END { if (!written) print key "=" value }
  ' "$config" >"$tmp"
  mv "$tmp" "$config"
}

ensure_samsung_avd() {
  if "$EMULATOR" -list-avds | grep -qx "$AVD"; then
    set_avd_config "hw.keyboard" "yes"
    return
  fi

  local avdmanager="$ANDROID_SDK/cmdline-tools/latest/bin/avdmanager"
  if [[ ! -x "$avdmanager" ]]; then
    echo "AVD '$AVD' does not exist and avdmanager was not found at $avdmanager." >&2
    exit 1
  fi

  echo "Creating $AVD with Samsung Galaxy S23 viewport settings..."
  echo no | "$avdmanager" create avd -n "$AVD" -k "$SYSTEM_IMAGE" -d pixel_6 --force >/dev/null
  set_avd_config "hw.device.manufacturer" "Samsung"
  set_avd_config "hw.device.name" "galaxy_s23"
  set_avd_config "hw.lcd.width" "1080"
  set_avd_config "hw.lcd.height" "2340"
  set_avd_config "hw.lcd.density" "425"
  set_avd_config "hw.ramSize" "4096"
  set_avd_config "hw.keyboard" "yes"
  set_avd_config "showDeviceFrame" "no"
  set_avd_config "skin.name" "1080x2340"
  set_avd_config "skin.path" "_no_skin"
}

if ! has_device; then
  if [[ -z "${EMULATOR:-}" || ! -x "$EMULATOR" ]]; then
    echo "No device is attached and the emulator binary was not found." >&2
    exit 1
  fi

  ensure_samsung_avd

  emulator_args=("@$AVD" "-no-audio" "-gpu" "swiftshader_indirect" "-no-snapshot-load" "-no-snapshot-save")
  if [[ "${FRESH_AVD:-0}" == "1" ]]; then
    emulator_args+=("-wipe-data")
  fi
  if [[ "${VISIBLE:-0}" != "1" ]]; then
    emulator_args+=("-no-window")
  fi

  start_emulator "${emulator_args[@]}"
  started_emulator=1
fi

wait_for_device_ready
"$ADB" shell wm size "$SIZE"
"$ADB" shell wm density "$DENSITY"
"$ADB" shell 'echo "chrome --disable-fre --no-first-run --no-default-browser-check" > /data/local/tmp/chrome-command-line' >/dev/null 2>&1 || true
"$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true

cd "$ROOT_DIR"
./gradlew :app:assembleProdDebug

"$ADB" install -r "$APK"
"$ADB" shell pm clear "$PACKAGE" >/dev/null
"$ADB" logcat -c
start_main_activity
sleep 3

mkdir -p "$OUT_DIR"
clear_stale_helper_artifacts
if [[ "${CAPTURE_DEMO_UI:-0}" != "1" ]]; then
  rm -f "$OUT_DIR"/demo-*.png "$OUT_DIR"/demo-*.xml "$OUT_DIR/demo-copy-leaks.log"
fi
capture_login_ui

grep -q 'content-desc="Dust logo"' "$OUT_DIR/login.xml"
grep -q 'text="The Operating System for AI Agents"' "$OUT_DIR/login.xml"
grep -q 'text="Sign in"' "$OUT_DIR/login.xml"
grep -q 'text="Sign up"' "$OUT_DIR/login.xml"
if grep -q 'text="Try sample workspace"' "$OUT_DIR/login.xml"; then
  echo "prodDebug login should not expose the local preview button." >&2
  exit 1
fi

"$ADB" shell am start -a android.intent.action.VIEW -d "dust://frame/smoke_frame" -p "$PACKAGE" >/dev/null
sleep 2
dump_ui /sdcard/dust-frame-login.xml "$OUT_DIR/frame-login.xml"
grep -q 'text="Sign in to view this shared frame."' "$OUT_DIR/frame-login.xml"
"$ADB" shell screencap -p /sdcard/dust-frame-login.png
"$ADB" pull /sdcard/dust-frame-login.png "$OUT_DIR/frame-login.png" >/dev/null
start_main_activity
sleep 2

open_workos_from_login "Sign up" "sign-up" "$OUT_DIR/sign-up-activities.txt"

start_main_activity
sleep 2

open_workos_from_login "Sign in" "sign-in" "$OUT_DIR/sign-in-activities.txt"

start_main_activity
sleep 2
capture_login_ui 0
cp "$OUT_DIR/login.xml" "$OUT_DIR/after-back.xml"
grep -q 'text="Sign in"' "$OUT_DIR/after-back.xml"

if "$ADB" logcat -d -v time | grep -Ei 'FATAL EXCEPTION|ANR in com\.dust\.mobile|Process com\.dust\.mobile has died|Unable to start activity|Unable to resume activity' >"$OUT_DIR/failures.log"; then
  echo "Smoke failed. Crash or ANR signatures were written to $OUT_DIR/failures.log" >&2
  exit 1
fi

if [[ "${CAPTURE_DEMO_UI:-0}" == "1" ]]; then
  ./gradlew :app:assembleDebug
  "$ADB" install -r "$ROOT_DIR/app/build/outputs/apk/debug/app-debug.apk"
  for screen in loading session-expired inbox-loading inbox empty-inbox compose detail thinking streaming files; do
    "$ADB" shell am start -S -n "$PACKAGE/.android.DemoPresentationActivity" --es screen "$screen" >/dev/null
    expected_text="$(demo_screen_expected_text "$screen")"
    wait_for_demo_screen_text "$screen" "$expected_text"
    sleep 1
    wait_for_demo_screen_text "$screen" "$expected_text"
    "$ADB" shell screencap -p "/sdcard/dust-demo-$screen.png"
    "$ADB" pull "/sdcard/dust-demo-$screen.png" "$OUT_DIR/demo-$screen.png" >/dev/null
  done
  if grep -Eih 'Aubin|prodDebug|production API|Android QA|mobile review|Samsung screenshots|demo build' "$OUT_DIR"/demo-*.xml >"$OUT_DIR/demo-copy-leaks.log"; then
    echo "Demo screenshot copy includes implementation-facing text. Matches were written to $OUT_DIR/demo-copy-leaks.log" >&2
    exit 1
  fi
  : >"$OUT_DIR/demo-copy-leaks.log"
  grep -q 'text="Loading Dust"' "$OUT_DIR/demo-loading.xml"
  grep -q 'text="Your session expired. Sign in again to continue."' "$OUT_DIR/demo-session-expired.xml"
  grep -q 'content-desc="Loading conversations"' "$OUT_DIR/demo-inbox-loading.xml"
  grep -q 'text="Pods"' "$OUT_DIR/demo-inbox.xml"
  if grep -Eq 'text="Customer Ops"|text="Launch Planning"' "$OUT_DIR/demo-inbox.xml"; then
    echo "Demo inbox should keep Pod links collapsed." >&2
    exit 1
  fi
  grep -q 'text="Coordinate launch follow-ups"' "$OUT_DIR/demo-inbox.xml"
  assert_text_top_at_least "Revenue Team" "$OUT_DIR/demo-inbox.xml" 80
  grep -q 'content-desc="Refresh conversations"' "$OUT_DIR/demo-inbox.xml"
  assert_only_avatar_description "$OUT_DIR/demo-inbox.xml" "Lea Martin avatar"
  if grep -q 'text="@sales' "$OUT_DIR/demo-inbox.xml"; then
    echo "Demo inbox should use customer-facing preview copy, not raw @sales mention text." >&2
    exit 1
  fi
  if grep -q 'text="Refresh"' "$OUT_DIR/demo-inbox.xml"; then
    echo "Demo inbox should use the compact refresh icon, not a visible Refresh button." >&2
    exit 1
  fi
  grep -q 'text="No conversations yet"' "$OUT_DIR/demo-empty-inbox.xml"
  assert_text_top_at_least "Revenue Team" "$OUT_DIR/demo-empty-inbox.xml" 80
  grep -q 'text="Ask anything or call an agent with @"' "$OUT_DIR/demo-compose.xml"
  grep -q 'text="New conversation"' "$OUT_DIR/demo-compose.xml"
  grep -q 'text="@Dust"' "$OUT_DIR/demo-compose.xml"
  grep -q 'content-desc="Add context"' "$OUT_DIR/demo-compose.xml"
  grep -q 'content-desc="Voice input"' "$OUT_DIR/demo-compose.xml"
  if grep -Eq 'text="Quick starts"|text="Draft customer brief"|content-desc="Send"' "$OUT_DIR/demo-compose.xml"; then
    echo "Demo compose should use the empty iOS-style composer state." >&2
    exit 1
  fi
  grep -q 'text="Briefing"' "$OUT_DIR/demo-detail.xml"
  grep -q 'content-desc="Open files and Frames"' "$OUT_DIR/demo-detail.xml"
  grep -q 'text="Ask anything or call an agent with @"' "$OUT_DIR/demo-detail.xml"
  grep -q 'content-desc="Add context"' "$OUT_DIR/demo-detail.xml"
  grep -q 'content-desc="Voice input"' "$OUT_DIR/demo-detail.xml"
  grep -q 'content-desc="New conversation"' "$OUT_DIR/demo-detail.xml"
  if grep -Eq 'content-desc="Photos"|content-desc="Files"|content-desc="Knowledge"|content-desc="Send"' \
    "$OUT_DIR/demo-detail.xml"; then
    echo "Demo detail should group secondary context actions behind the composer plus button." >&2
    exit 1
  fi
  grep -q 'text="Thinking..."' "$OUT_DIR/demo-thinking.xml"
  grep -q 'content-desc="New conversation"' "$OUT_DIR/demo-thinking.xml"
  grep -q 'text="Streaming"' "$OUT_DIR/demo-streaming.xml"
  grep -q 'content-desc="New conversation"' "$OUT_DIR/demo-streaming.xml"
  grep -q 'text="customer-briefing.pdf"' "$OUT_DIR/demo-files.xml"
  grep -q 'text="Conversation files"' "$OUT_DIR/demo-files.xml"
  if grep -q 'text="Close"' "$OUT_DIR/demo-files.xml"; then
    echo "Demo files should use app-bar back navigation, not a visible Close button." >&2
    exit 1
  fi
  if grep -q 'text="Document · by @sales"' "$OUT_DIR/demo-files.xml"; then
    echo "Demo files should use customer-facing source labels, not raw @sales mention text." >&2
    exit 1
  fi
fi

write_artifact_manifest

echo "Samsung prod smoke passed."
echo "Artifacts: $OUT_DIR"
echo "Artifact manifest: $OUT_DIR/prod-artifacts.txt"
echo "Review page: $OUT_DIR/prod-review.html"
echo "Viewport: $SIZE @ $DENSITY dpi"
