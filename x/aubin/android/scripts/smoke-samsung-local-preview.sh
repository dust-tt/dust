#!/usr/bin/env bash
set -euo pipefail

ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB:-${ANDROID_SDK:+$ANDROID_SDK/platform-tools/adb}}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
ACTIVITY="${ACTIVITY:-.android.MainActivity}"
OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke/local-preview-flow}"

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

capture_screen() {
  local name="$1"
  local device_xml="/sdcard/dust-${name}.xml"
  local device_png="/sdcard/dust-${name}.png"

  wait_for_dust_activity_ready
  dump_ui "$device_xml" "$OUT_DIR/${name}.xml"
  "$ADB" shell screencap -p "$device_png"
  "$ADB" pull "$device_png" "$OUT_DIR/${name}.png" >/dev/null
}

capture_ui() {
  local name="$1"
  local device_xml="/sdcard/dust-${name}.xml"

  wait_for_dust_activity_ready
  dump_ui "$device_xml" "$OUT_DIR/${name}.xml"
}

capture_pixels() {
  local name="$1"
  local device_png="/sdcard/dust-${name}.png"
  local candidate
  local candidate_size
  local best_size=0

  wait_for_dust_activity_ready
  for attempt in 1 2 3; do
    candidate="$OUT_DIR/${name}-${attempt}.png"
    "$ADB" shell screencap -p "$device_png"
    "$ADB" pull "$device_png" "$candidate" >/dev/null
    candidate_size="$(wc -c <"$candidate" | tr -d ' ')"
    if (( candidate_size > best_size )); then
      cp "$candidate" "$OUT_DIR/${name}.png"
      best_size="$candidate_size"
    fi
    sleep 1
  done
  rm -f "$OUT_DIR/${name}-1.png" "$OUT_DIR/${name}-2.png" "$OUT_DIR/${name}-3.png"
}

settle_full_screen_compositor() {
  "$ADB" shell input tap 540 150
  sleep 1
}

hide_keyboard_if_visible() {
  if "$ADB" shell dumpsys input_method | grep -q 'mInputShown=true'; then
    "$ADB" shell input keyevent KEYCODE_BACK
    sleep 1
  fi
}

clear_legacy_top_level_artifacts() {
  local parent_dir
  parent_dir="$(dirname "$OUT_DIR")"
  if [[ "$(basename "$OUT_DIR")" == "local-preview-flow" && "$parent_dir" != "." && "$parent_dir" != "/" ]]; then
    find "$parent_dir" -maxdepth 1 -type f -name 'local-preview-*' -exec rm -f {} +
  fi
}

print_latest_texts() {
  local xml_path="$1"
  grep -o 'text="[^"]*"' "$xml_path" | head -n 30 >&2 || true
}

tap_text_from_dump() {
  local text="$1"
  local xml_path="$2"
  local occurrence="${3:-first}"
  local bounds
  local matches

  matches="$(
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
          next
        }

        text_bounds = extract_bounds($0)
        if (text_bounds != "") {
          print_bounds(text_bounds)
        }
      }
    '
  )"

  if [[ "$occurrence" == "last" ]]; then
    bounds="$(tail -n 1 <<<"$matches")"
  else
    bounds="$(head -n 1 <<<"$matches")"
  fi

  if [[ -z "$bounds" ]]; then
    echo "Could not find tappable text '$text' in $xml_path." >&2
    print_latest_texts "$xml_path"
    exit 1
  fi

  local left top right bottom
  read -r left top right bottom <<<"$bounds"
  "$ADB" shell input tap "$(((left + right) / 2))" "$(((top + bottom) / 2))"
}

tap_text_containing_from_dump() {
  local needle="$1"
  local xml_path="$2"
  local bounds

  bounds="$(
    tr '<' '\n' <"$xml_path" | sed -n -E \
      "/text=\"[^\"]*$needle[^\"]*\"/s/.*bounds=\"\\[([0-9]+),([0-9]+)\\]\\[([0-9]+),([0-9]+)\\]\".*/\\1 \\2 \\3 \\4/p" \
      | head -n 1
  )"

  if [[ -z "$bounds" ]]; then
    echo "Could not find tappable text containing '$needle' in $xml_path." >&2
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

wait_for_text() {
  local text="$1"
  local screen_name="$2"

  for _ in 1 2 3 4 5 6 7 8; do
    capture_screen "$screen_name"
    if grep -q "text=\"$text\"" "$OUT_DIR/${screen_name}.xml"; then
      sleep 1
      capture_screen "$screen_name"
      grep -q "text=\"$text\"" "$OUT_DIR/${screen_name}.xml"
      return
    fi
    sleep 1
  done

  echo "Text '$text' did not appear." >&2
  print_latest_texts "$OUT_DIR/${screen_name}.xml"
  exit 1
}

wait_for_ui_text() {
  local text="$1"
  local screen_name="$2"

  for _ in 1 2 3 4 5 6 7 8; do
    capture_ui "$screen_name"
    if grep -q "text=\"$text\"" "$OUT_DIR/${screen_name}.xml"; then
      sleep 1
      capture_ui "$screen_name"
      grep -q "text=\"$text\"" "$OUT_DIR/${screen_name}.xml"
      return
    fi
    sleep 1
  done

  echo "Text '$text' did not appear." >&2
  print_latest_texts "$OUT_DIR/${screen_name}.xml"
  exit 1
}

wait_for_text_containing() {
  local needle="$1"
  local screen_name="$2"

  for _ in 1 2 3 4 5 6 7 8; do
    capture_screen "$screen_name"
    if grep -q "$needle" "$OUT_DIR/${screen_name}.xml"; then
      sleep 1
      capture_screen "$screen_name"
      grep -q "$needle" "$OUT_DIR/${screen_name}.xml"
      return
    fi
    sleep 1
  done

  echo "Text containing '$needle' did not appear." >&2
  print_latest_texts "$OUT_DIR/${screen_name}.xml"
  exit 1
}

open_local_preview_inbox() {
  "$ADB" shell am start -S -a android.intent.action.VIEW -d "dust://local-preview" -p "$PACKAGE" >/dev/null
  wait_for_text "Search conversations" "local-preview-inbox"
  grep -q 'text="Sample workspace"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'text="Revenue Team"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'content-desc="Switch workspace"' "$OUT_DIR/local-preview-inbox.xml"
}

assert_auth_storage_empty() {
  local prefs
  prefs="$("$ADB" shell run-as "$PACKAGE" cat shared_prefs/dust_auth.xml 2>/dev/null || true)"
  if grep -q '<string name=' <<<"$prefs"; then
    echo "Expected local preview to leave auth storage empty." >&2
    echo "$prefs" >&2
    exit 1
  fi
}

assert_demo_copy_is_customer_facing() {
  local leak_log="$OUT_DIR/local-preview-copy-leaks.log"

  if grep -Eih 'Aubin|Local preview|prodDebug|production API|Android QA|mobile review|Samsung screenshots|demo build|acme\.example|@acme\.|@sales|\.example' "$OUT_DIR"/local-preview-*.xml >"$leak_log"; then
    echo "Local preview copy includes implementation-facing text. Matches were written to $leak_log" >&2
    exit 1
  fi

  : >"$leak_log"
}

assert_compose_tools_visible() {
  if grep -q 'content-desc="Switch workspace"' "$OUT_DIR/local-preview-compose.xml"; then
    echo "New conversation should keep the workspace title static while the draft is scoped to one workspace." >&2
    exit 1
  fi

  grep -q 'text="Ask anything or call an agent with @"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'text="Good to see you, Lea!"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'text="Dust"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'text="Sales Team"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'text="Launch Team"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Dust avatar"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Capabilities"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Add context"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Voice input"' "$OUT_DIR/local-preview-compose.xml"
  if grep -q 'content-desc="Send"\|text="Quick starts"\|text="Draft customer brief"' "$OUT_DIR/local-preview-compose.xml"; then
    echo "An empty web-style composer should show voice input without legacy quick starts or an enabled send action." >&2
    exit 1
  fi

  tap_content_desc_from_dump "Add context" "$OUT_DIR/local-preview-compose.xml"
  wait_for_ui_text "Capabilities" "local-preview-compose-context-menu"
  grep -q 'text="Photos"' "$OUT_DIR/local-preview-compose-context-menu.xml"
  grep -q 'text="Files"' "$OUT_DIR/local-preview-compose-context-menu.xml"
  grep -q 'text="Knowledge"' "$OUT_DIR/local-preview-compose-context-menu.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_ui_text "Ask anything or call an agent with @" "local-preview-compose"
}

assert_catch_up_flow() {
  tap_text_from_dump "Catch Up" "$OUT_DIR/local-preview-inbox.xml"
  wait_for_text "Respond" "local-preview-catch-up-action"
  grep -q 'text="1 of 2"' "$OUT_DIR/local-preview-catch-up-action.xml"
  grep -q 'text="Prepare the Q3 customer briefing"' "$OUT_DIR/local-preview-catch-up-action.xml"
  grep -q 'text="Keep for later"' "$OUT_DIR/local-preview-catch-up-action.xml"
  grep -q 'text="This conversation needs your action. Open it to respond."' \
    "$OUT_DIR/local-preview-catch-up-action.xml"
  if grep -q 'text="Mark as read"' "$OUT_DIR/local-preview-catch-up-action.xml"; then
    echo "Action-required Catch Up cards should open the conversation instead of marking it read." >&2
    exit 1
  fi

  tap_text_from_dump "Keep for later" "$OUT_DIR/local-preview-catch-up-action.xml"
  wait_for_text "Mark as read" "local-preview-catch-up-unread"
  grep -q 'text="2 of 2"' "$OUT_DIR/local-preview-catch-up-unread.xml"
  grep -q 'text="Coordinate launch follow-ups"' "$OUT_DIR/local-preview-catch-up-unread.xml"
  grep -q 'text="Keep for later"' "$OUT_DIR/local-preview-catch-up-unread.xml"

  tap_content_desc_from_dump "Close" "$OUT_DIR/local-preview-catch-up-unread.xml"
  wait_for_text "Search conversations" "local-preview-inbox"
}

assert_agent_picker_flow() {
  tap_content_desc_from_dump "Dust avatar" "$OUT_DIR/local-preview-compose.xml"
  wait_for_text "Select an agent" "local-preview-agent-picker"
  grep -q 'content-desc="Selected agent"' "$OUT_DIR/local-preview-agent-picker.xml"
  grep -q 'text="Sales Team"' "$OUT_DIR/local-preview-agent-picker.xml"

  tap_text_from_dump "Search agents" "$OUT_DIR/local-preview-agent-picker.xml"
  sleep 1
  "$ADB" shell input text "Sales"
  wait_for_text "Sales" "local-preview-agent-picker-search"
  grep -q 'content-desc="Clear search"' "$OUT_DIR/local-preview-agent-picker-search.xml"
  grep -q 'text="Sales Team"' "$OUT_DIR/local-preview-agent-picker-search.xml"
  tap_content_desc_from_dump "Clear search" "$OUT_DIR/local-preview-agent-picker-search.xml"
  sleep 1
  hide_keyboard_if_visible
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_ui_text "Ask anything or call an agent with @" "local-preview-compose"
}

assert_voice_input_visible() {
  local xml_path="$1"

  grep -q 'content-desc="Exit voice input"' "$xml_path"
  grep -q 'content-desc="Send message"' "$xml_path"
  if grep -q 'content-desc="Switch workspace"\|text="New conversation"' "$xml_path"; then
    echo "Voice input should cover the app chrome." >&2
    exit 1
  fi
}

assert_workspace_switching() {
  tap_text_from_dump "Revenue Team" "$OUT_DIR/local-preview-inbox.xml"
  sleep 1
  capture_screen "local-preview-workspace-menu"
  grep -q 'text="Launch Team"' "$OUT_DIR/local-preview-workspace-menu.xml"

  tap_text_from_dump "Launch Team" "$OUT_DIR/local-preview-workspace-menu.xml"
  wait_for_text "Launch Team" "local-preview-workspace-launch"
  grep -q 'text="Search conversations"' "$OUT_DIR/local-preview-workspace-launch.xml"
  grep -q 'text="Finalize launch readiness"' "$OUT_DIR/local-preview-workspace-launch.xml"

  tap_text_from_dump "Launch Team" "$OUT_DIR/local-preview-workspace-launch.xml"
  sleep 1
  capture_screen "local-preview-workspace-menu-return"
  grep -q 'text="Revenue Team"' "$OUT_DIR/local-preview-workspace-menu-return.xml"

  tap_text_from_dump "Revenue Team" "$OUT_DIR/local-preview-workspace-menu-return.xml"
  wait_for_text "Revenue Team" "local-preview-inbox"
  grep -q 'text="Search conversations"' "$OUT_DIR/local-preview-inbox.xml"
}

assert_file_viewer_chrome_compact() {
  local title_count

  if grep -q 'text="Close"' "$OUT_DIR/local-preview-file-viewer.xml"; then
    echo "File viewer should rely on the app bar instead of rendering an inline Close button." >&2
    exit 1
  fi

  title_count="$(grep -o 'text="Briefing summary.md"' "$OUT_DIR/local-preview-file-viewer.xml" | wc -l | tr -d ' ')"
  if [[ "$title_count" != "1" ]]; then
    echo "Expected one Briefing summary.md title in the file viewer, found $title_count." >&2
    exit 1
  fi
}

assert_detail_reply_controls_visible() {
  grep -q 'content-desc="Conversation files"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'text="Ask anything or call an agent with @"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'content-desc="Dust avatar"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'content-desc="Capabilities"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'content-desc="Add context"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'content-desc="Voice input"' "$OUT_DIR/local-preview-detail.xml"
  if grep -q 'content-desc="Photos"\|content-desc="Files"\|content-desc="Knowledge"\|text="Tools"' \
    "$OUT_DIR/local-preview-detail.xml"; then
    echo "Detail context actions should stay grouped behind the composer context menu." >&2
    exit 1
  fi
}

assert_sample_detail_actions_are_local() {
  if grep -q 'text="Open web"' "$OUT_DIR/local-preview-detail.xml"; then
    echo "Sample workspace conversations should not expose Open web links for local-only conversations." >&2
    exit 1
  fi
}

assert_account_menu_visible() {
  grep -q 'text="Lea Martin"' "$OUT_DIR/local-preview-account-menu.xml"
  grep -q 'text="lea.martin@dust.tt"' "$OUT_DIR/local-preview-account-menu.xml"
  grep -q 'text="Sign out"' "$OUT_DIR/local-preview-account-menu.xml"
}

assert_account_menu_target_size() {
  local xml_path="$OUT_DIR/local-preview-inbox.xml"
  local density
  local min_px
  local bounds
  local x1 y1 x2 y2 width height

  density="$(
    "$ADB" shell wm density | tr -d '\r' | awk '
      /Override density:/ { density = $3 }
      /Physical density:/ && density == "" { density = $3 }
      END { print density }
    '
  )"
  density="${density:-160}"
  min_px=$(((48 * density + 159) / 160))
  bounds="$(
    tr '<' '\n' <"$xml_path" | awk '
      index($0, "content-desc=\"Account menu\"") {
        if (match($0, /bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"/)) {
          bounds = substr($0, RSTART, RLENGTH)
          gsub(/[^0-9]+/, " ", bounds)
          gsub(/^ +| +$/, "", bounds)
          print bounds
          exit
        }
      }
    '
  )"

  if [[ -z "$bounds" ]]; then
    echo "Could not find Account menu bounds in $xml_path." >&2
    exit 1
  fi

  read -r x1 y1 x2 y2 <<<"$bounds"
  width=$((x2 - x1))
  height=$((y2 - y1))
  if ((width < min_px || height < min_px)); then
    echo "Account menu tap target is ${width}x${height}px, expected at least ${min_px}px for 48dp." >&2
    exit 1
  fi
}

write_artifact_manifest() {
  local manifest="$OUT_DIR/local-preview-artifacts.txt"
  local review_html="$OUT_DIR/local-preview-review.html"
  local generated_at
  local device_size
  local device_density

  generated_at="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  device_size="$("$ADB" shell wm size | tr -d '\r' | awk -F': ' '/Physical size:/ { print $2; exit }')"
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
  <title>Dust Android sample workspace</title>
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
      margin-top: 16px;
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
      <h1>Dust Android sample workspace</h1>
      <p>Samsung-sized screenshots from the local preview flow.</p>
      <ul class="meta" aria-label="Run metadata">
        <li>Generated: $generated_at</li>
        <li>Device: ${device_size:-unknown} @ ${device_density:-unknown} dpi</li>
        <li>Variant: prodDebug</li>
        <li>URLs: https://dust.tt + https://app.dust.tt</li>
      </ul>
      <ul class="checks" aria-label="Smoke checks">
        <li>Sample workspace data is rendered without WorkOS credentials.</li>
        <li>Auth preferences stay empty after the local preview starts.</li>
        <li>Crash, ANR, and activity-start log signatures are checked.</li>
        <li>Local-only conversation screens do not expose web-open actions.</li>
      </ul>
    </header>
    <section class="grid">
      <figure>
        <figcaption>Login</figcaption>
        <img src="local-preview-login.png" alt="Login screen">
      </figure>
      <figure>
        <figcaption>Inbox</figcaption>
        <img src="local-preview-inbox.png" alt="Inbox screen">
      </figure>
      <figure>
        <figcaption>Catch Up - action required</figcaption>
        <img src="local-preview-catch-up-action.png" alt="Catch Up card that opens an action-required conversation">
      </figure>
      <figure>
        <figcaption>Catch Up - unread</figcaption>
        <img src="local-preview-catch-up-unread.png" alt="Catch Up card that can be marked as read">
      </figure>
      <figure>
        <figcaption>Account menu</figcaption>
        <img src="local-preview-account-menu.png" alt="Account menu">
      </figure>
      <figure>
        <figcaption>Workspace switcher</figcaption>
        <img src="local-preview-workspace-menu.png" alt="Workspace switcher menu">
      </figure>
      <figure>
        <figcaption>Launch Team inbox</figcaption>
        <img src="local-preview-workspace-launch.png" alt="Launch Team workspace inbox">
      </figure>
      <figure>
        <figcaption>Workspace return</figcaption>
        <img src="local-preview-workspace-menu-return.png" alt="Workspace switcher return menu">
      </figure>
      <figure>
        <figcaption>New conversation</figcaption>
        <img src="local-preview-compose.png" alt="New conversation screen">
      </figure>
      <figure>
        <figcaption>Agent picker</figcaption>
        <img src="local-preview-agent-picker.png" alt="Agent picker with the current agent selected">
      </figure>
      <figure>
        <figcaption>Voice input - listening</figcaption>
        <img src="local-preview-voice-listening.png" alt="Voice input with a live transcript">
      </figure>
      <figure>
        <figcaption>Voice input - paused</figcaption>
        <img src="local-preview-voice-paused.png" alt="Voice input ready to send or resume">
      </figure>
      <figure>
        <figcaption>Typed draft</figcaption>
        <img src="local-preview-compose-filled.png" alt="Typed draft ready to send">
      </figure>
      <figure>
        <figcaption>Conversation detail</figcaption>
        <img src="local-preview-detail.png" alt="Conversation detail screen">
      </figure>
      <figure>
        <figcaption>Reply sent</figcaption>
        <img src="local-preview-detail-replied.png" alt="Conversation detail after sending a reply">
      </figure>
      <figure>
        <figcaption>File viewer</figcaption>
        <img src="local-preview-file-viewer.png" alt="File viewer screen">
      </figure>
    </section>
  </main>
</body>
</html>
HTML

  {
    echo "Dust Android local preview smoke artifacts"
    echo "Generated: $generated_at"
    echo "Device: ${device_size:-unknown} @ ${device_density:-unknown} dpi"
    echo "Variant: prodDebug"
    echo "URLs: https://dust.tt + https://app.dust.tt"
    echo
    echo "Review page:"
    echo "- $review_html"
    echo
    echo "Review screenshots:"
    echo "- Login: $OUT_DIR/local-preview-login.png"
    echo "- Inbox: $OUT_DIR/local-preview-inbox.png"
    echo "- Catch Up action required: $OUT_DIR/local-preview-catch-up-action.png"
    echo "- Catch Up unread: $OUT_DIR/local-preview-catch-up-unread.png"
    echo "- Account menu: $OUT_DIR/local-preview-account-menu.png"
    echo "- Workspace switcher: $OUT_DIR/local-preview-workspace-menu.png"
    echo "- Launch Team inbox: $OUT_DIR/local-preview-workspace-launch.png"
    echo "- Workspace return menu: $OUT_DIR/local-preview-workspace-menu-return.png"
    echo "- New conversation: $OUT_DIR/local-preview-compose.png"
    echo "- Agent picker: $OUT_DIR/local-preview-agent-picker.png"
    echo "- Voice input listening: $OUT_DIR/local-preview-voice-listening.png"
    echo "- Voice input paused: $OUT_DIR/local-preview-voice-paused.png"
    echo "- Typed draft: $OUT_DIR/local-preview-compose-filled.png"
    echo "- Conversation detail: $OUT_DIR/local-preview-detail.png"
    echo "- Reply sent: $OUT_DIR/local-preview-detail-replied.png"
    echo "- File viewer: $OUT_DIR/local-preview-file-viewer.png"
    echo
    echo "Machine-check UI dumps:"
    echo "- Typed draft: $OUT_DIR/local-preview-compose-filled.xml"
    echo "- Workspace menu: $OUT_DIR/local-preview-workspace-menu.xml"
    echo "- Launch Team inbox: $OUT_DIR/local-preview-workspace-launch.xml"
    echo "- Workspace return menu: $OUT_DIR/local-preview-workspace-menu-return.xml"
    echo "- Login: $OUT_DIR/local-preview-login.xml"
    echo "- Inbox: $OUT_DIR/local-preview-inbox.xml"
    echo "- Catch Up action required: $OUT_DIR/local-preview-catch-up-action.xml"
    echo "- Catch Up unread: $OUT_DIR/local-preview-catch-up-unread.xml"
    echo "- Account menu: $OUT_DIR/local-preview-account-menu.xml"
    echo "- New conversation: $OUT_DIR/local-preview-compose.xml"
    echo "- Agent picker: $OUT_DIR/local-preview-agent-picker.xml"
    echo "- Agent picker search: $OUT_DIR/local-preview-agent-picker-search.xml"
    echo "- Voice input listening: $OUT_DIR/local-preview-voice-listening.xml"
    echo "- Voice input paused: $OUT_DIR/local-preview-voice-paused.xml"
    echo "- Conversation detail: $OUT_DIR/local-preview-detail.xml"
    echo "- Reply draft: $OUT_DIR/local-preview-detail-reply-ime.xml"
    echo "- Reply sent: $OUT_DIR/local-preview-detail-replied.xml"
    echo "- File viewer: $OUT_DIR/local-preview-file-viewer.xml"
    echo
    echo "Notes:"
    echo "- The typed draft screenshot is captured before send to show the filled composer without credentials."
    echo "- Catch Up triage, new-conversation setup, and an existing-conversation reply are exercised end to end."
    echo "- local-preview-copy-leaks.log and local-preview-failures.log are empty on success."
  } >"$manifest"
}

if ! has_device; then
  echo "No attached Android device/emulator. Start a visible emulator first." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
clear_legacy_top_level_artifacts
rm -f "$OUT_DIR"/local-preview-*

"$ADB" wait-for-device shell 'while [ "$(getprop sys.boot_completed)" != "1" ]; do sleep 1; done'
"$ADB" shell am force-stop com.android.chrome >/dev/null 2>&1 || true
"$ADB" shell am force-stop com.google.android.documentsui >/dev/null 2>&1 || true
"$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
"$ADB" shell pm clear "$PACKAGE" >/dev/null
sleep 1
"$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1 || true
"$ADB" logcat -c
"$ADB" shell am start -S -n "$PACKAGE/$ACTIVITY" >/dev/null
wait_for_dust_activity_ready

wait_for_text "Sign in" "local-preview-login"
if grep -q 'text="Try sample workspace"' "$OUT_DIR/local-preview-login.xml"; then
  echo "prodDebug login should not expose the local preview button." >&2
  exit 1
fi
open_local_preview_inbox
grep -q 'content-desc="Refresh conversations"' "$OUT_DIR/local-preview-inbox.xml"
if grep -q 'text="Refresh"' "$OUT_DIR/local-preview-inbox.xml"; then
  echo "Inbox refresh should render as an accessible icon button, not a text chip." >&2
  exit 1
fi
grep -q 'text="Prepare the Q3 customer briefing"' "$OUT_DIR/local-preview-inbox.xml"
if grep -q 'text="@"' "$OUT_DIR/local-preview-inbox.xml"; then
  echo "Inbox conversation avatars should show meaningful initials, not placeholder @ glyphs." >&2
  exit 1
fi
assert_catch_up_flow
assert_workspace_switching
grep -q 'content-desc="Account menu"' "$OUT_DIR/local-preview-inbox.xml"
assert_account_menu_target_size
tap_content_desc_from_dump "Account menu" "$OUT_DIR/local-preview-inbox.xml"
wait_for_text "Sign out" "local-preview-account-menu"
assert_account_menu_visible
"$ADB" shell input keyevent KEYCODE_BACK
sleep 1
capture_ui "local-preview-inbox"
tap_content_desc_from_dump "New conversation" "$OUT_DIR/local-preview-inbox.xml"

wait_for_text "Ask anything or call an agent with @" "local-preview-compose"
assert_compose_tools_visible
assert_agent_picker_flow
settle_full_screen_compositor
capture_pixels "local-preview-compose"
tap_content_desc_from_dump "Voice input" "$OUT_DIR/local-preview-compose.xml"
wait_for_ui_text "Draft a concise launch update with owners and next steps" "local-preview-voice-listening"
assert_voice_input_visible "$OUT_DIR/local-preview-voice-listening.xml"
grep -q 'content-desc="Stop recording"' "$OUT_DIR/local-preview-voice-listening.xml"
sleep 2
settle_full_screen_compositor
capture_pixels "local-preview-voice-listening"
tap_content_desc_from_dump "Stop recording" "$OUT_DIR/local-preview-voice-listening.xml"
wait_for_ui_text "Paused - send or keep recording" "local-preview-voice-paused"
assert_voice_input_visible "$OUT_DIR/local-preview-voice-paused.xml"
grep -q 'content-desc="Start recording"' "$OUT_DIR/local-preview-voice-paused.xml"
sleep 1
settle_full_screen_compositor
capture_pixels "local-preview-voice-paused"
tap_content_desc_from_dump "Exit voice input" "$OUT_DIR/local-preview-voice-paused.xml"
wait_for_text "Draft a concise launch update with owners and next steps" "local-preview-compose-after-voice"
grep -q 'text="Draft a concise launch update with owners and next steps"' \
  "$OUT_DIR/local-preview-compose-after-voice.xml"
"$ADB" shell input keyevent KEYCODE_BACK
wait_for_text "Search conversations" "local-preview-inbox"
tap_content_desc_from_dump "New conversation" "$OUT_DIR/local-preview-inbox.xml"
wait_for_text "Ask anything or call an agent with @" "local-preview-compose"
tap_text_from_dump "Ask anything or call an agent with @" "$OUT_DIR/local-preview-compose.xml"
sleep 1
"$ADB" shell input text "Draft%scustomer%sbrief"
wait_for_ui_text "Draft customer brief" "local-preview-compose-filled"
sleep 1
capture_screen "local-preview-compose-filled"
grep -q 'text="Draft customer brief"' "$OUT_DIR/local-preview-compose-filled.xml"
grep -q 'content-desc="Send"' "$OUT_DIR/local-preview-compose-filled.xml"
tap_content_desc_from_dump "Send" "$OUT_DIR/local-preview-compose-filled.xml"

wait_for_text_containing "Action list:" "local-preview-detail"
settle_full_screen_compositor
capture_pixels "local-preview-detail"
grep -q 'text="Briefing"' "$OUT_DIR/local-preview-detail.xml"
if grep -q 'content-desc="Switch workspace"' "$OUT_DIR/local-preview-detail.xml"; then
  echo "Conversation detail should not expose workspace switching for a conversation already scoped to one workspace." >&2
  exit 1
fi
if grep -q 'text="Draft customer brief"' "$OUT_DIR/local-preview-detail.xml"; then
  echo "Sample detail app bar should use the fitted Briefing title, not the draft prompt." >&2
  exit 1
fi
if grep -q 'text="Customer briefing"' "$OUT_DIR/local-preview-detail.xml"; then
  echo "Sample detail app bar title should be short enough to fit beside the sample workspace chip." >&2
  exit 1
fi
grep -q 'text="Briefing summary.md"' "$OUT_DIR/local-preview-detail.xml"
assert_detail_reply_controls_visible
assert_sample_detail_actions_are_local
tap_text_containing_from_dump "Briefing summary.md" "$OUT_DIR/local-preview-detail.xml"

wait_for_text_containing "Customer briefing summary" "local-preview-file-viewer"
settle_full_screen_compositor
capture_pixels "local-preview-file-viewer"
assert_file_viewer_chrome_compact
"$ADB" shell input keyevent KEYCODE_BACK
wait_for_text_containing "Action list:" "local-preview-detail-returned"
tap_text_from_dump "Ask anything or call an agent with @" "$OUT_DIR/local-preview-detail-returned.xml"
sleep 1
"$ADB" shell input text "Thanks%sthis%shelps"
wait_for_text "Thanks this helps" "local-preview-detail-reply-ime"
grep -q 'content-desc="Send"' "$OUT_DIR/local-preview-detail-reply-ime.xml"
tap_content_desc_from_dump "Send" "$OUT_DIR/local-preview-detail-reply-ime.xml"
wait_for_text_containing \
  "I drafted a concise response with the recommendation" \
  "local-preview-detail-replied-ime"
hide_keyboard_if_visible
capture_screen "local-preview-detail-replied"
grep -q 'text="Thanks this helps"' "$OUT_DIR/local-preview-detail-replied.xml"
grep -q 'I drafted a concise response with the recommendation' \
  "$OUT_DIR/local-preview-detail-replied.xml"
assert_demo_copy_is_customer_facing
assert_auth_storage_empty
open_local_preview_inbox
write_artifact_manifest

if "$ADB" logcat -d -v time | grep -Ei 'FATAL EXCEPTION|ANR in com\.dust\.mobile|Process com\.dust\.mobile has died|Unable to start activity|Unable to resume activity' >"$OUT_DIR/local-preview-failures.log"; then
  echo "Local preview smoke failed. Crash or ANR signatures were written to $OUT_DIR/local-preview-failures.log" >&2
  exit 1
fi

echo "Samsung local preview smoke passed."
echo "Artifacts: $OUT_DIR"
echo "Artifact manifest: $OUT_DIR/local-preview-artifacts.txt"
echo "Review page: $OUT_DIR/local-preview-review.html"
