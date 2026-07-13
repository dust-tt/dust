#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke}"
LOCAL_PREVIEW_DIR="$OUT_DIR/local-preview-flow"
ADB="${ADB:-adb}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
SIZE="${SAMSUNG_SIZE:-1080x2340}"
DENSITY="${SAMSUNG_DENSITY:-425}"
SCREENSHOT_MIN_BYTES="${SCREENSHOT_MIN_BYTES:-10000}"
PROD_LOGIN_SCREENSHOT_MIN_BYTES="${PROD_LOGIN_SCREENSHOT_MIN_BYTES:-50000}"
REQUIRE_DEMO_ARTIFACTS="${REQUIRE_DEMO_ARTIFACTS:-0}"
CURRENT_UI_XML="${TMPDIR:-/tmp}/dust-presentation-current.xml"
CRASH_PATTERN='FATAL EXCEPTION|ANR in com\.dust\.mobile|Process com\.dust\.mobile has died|Unable to start activity|Unable to resume activity'
DEMO_SCREENS=(loading session-expired inbox empty-inbox compose detail files)
AUTHENTICATED_SCREENS=(inbox account-menu compose)

cleanup() {
  rm -f "$CURRENT_UI_XML"
}
trap cleanup EXIT

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required presentation artifact: $path" >&2
    exit 1
  fi
}

require_empty_file() {
  local path="$1"
  require_file "$path"
  if [[ -s "$path" ]]; then
    echo "Expected empty presentation check file: $path" >&2
    exit 1
  fi
}

require_no_text() {
  local text="$1"
  local path="$2"
  require_file "$path"
  if grep -q "$text" "$path"; then
    echo "Unexpected text '$text' in $path." >&2
    exit 1
  fi
}

require_text() {
  local text="$1"
  local path="$2"
  require_file "$path"
  if ! grep -q "$text" "$path"; then
    echo "Missing text '$text' in $path." >&2
    exit 1
  fi
}

require_no_matching_files() {
  local pattern="$1"
  local matches

  matches="$(find "$OUT_DIR" -maxdepth 1 -type f -name "$pattern" -print)"
  if [[ -n "$matches" ]]; then
    echo "Unexpected stale presentation artifact(s):" >&2
    echo "$matches" >&2
    exit 1
  fi
}

require_samsung_png() {
  local path="$1"
  local bytes
  local metadata
  local expected_dimensions="${SIZE/x/ x }"

  require_file "$path"
  bytes="$(wc -c <"$path" | tr -d ' ')"
  if [[ "$bytes" -lt "$SCREENSHOT_MIN_BYTES" ]]; then
    echo "Screenshot is too small to be a valid Samsung capture: $path ($bytes bytes)." >&2
    exit 1
  fi

  metadata="$(file "$path")"
  if [[ "$metadata" != *"PNG image data, $expected_dimensions,"* ]]; then
    echo "Expected Samsung-sized PNG $expected_dimensions at $path." >&2
    echo "$metadata" >&2
    exit 1
  fi
}

file_mtime_seconds() {
  local path="$1"
  local mtime

  mtime="$(stat -f '%m' "$path" 2>/dev/null || true)"
  if [[ "$mtime" =~ ^[0-9]+$ ]]; then
    echo "$mtime"
    return
  fi

  mtime="$(stat -c '%Y' "$path" 2>/dev/null || true)"
  if [[ "$mtime" =~ ^[0-9]+$ ]]; then
    echo "$mtime"
    return
  fi

  echo "Unable to read file modification time for $path." >&2
  exit 1
}

require_not_older_than() {
  local checked_path="$1"
  local reference_path="$2"
  local recovery_command="$3"
  local checked_mtime
  local reference_mtime

  require_file "$checked_path"
  require_file "$reference_path"

  checked_mtime="$(file_mtime_seconds "$checked_path")"
  reference_mtime="$(file_mtime_seconds "$reference_path")"
  if [[ "$checked_mtime" -lt "$reference_mtime" ]]; then
    echo "Stale presentation artifact: $checked_path is older than $reference_path." >&2
    echo "Refresh it with:" >&2
    echo "  $recovery_command" >&2
    exit 1
  fi
}

print_ui_texts() {
  local path="$1"
  grep -o 'text="[^"]*"' "$path" | grep -v '^text=""$' | head -n 30 | sed 's/^/  /' >&2 || true
}

require_text_top_at_least() {
  local text="$1"
  local path="$2"
  local min_top="$3"
  local top

  require_file "$path"
  top="$(
    tr '<' '\n' <"$path" | sed -n -E \
      "/text=\"$text\"/s/.*bounds=\"\[[0-9]+,([0-9]+)\]\[[0-9]+,[0-9]+\]\".*/\1/p" \
      | head -n 1
  )"

  if [[ -z "$top" ]]; then
    echo "Could not find text '$text' in $path." >&2
    print_ui_texts "$path"
    exit 1
  fi

  if [[ "$top" -lt "$min_top" ]]; then
    echo "Text '$text' is too close to the status bar in $path: top=$top, expected >= $min_top." >&2
    exit 1
  fi
}

require_current_ui_text() {
  local text="$1"
  local path="$2"
  require_file "$path"
  if ! grep -q "$text" "$path"; then
    echo "The visible Samsung app is not on the expected sample workspace inbox." >&2
    echo "Missing text '$text' in $path." >&2
    echo "Current visible texts:" >&2
    print_ui_texts "$path"
    echo "Reopen the expected final screen with:" >&2
    echo "  ADB=\"$ADB\" PACKAGE=\"$PACKAGE\" OUT_DIR=\"$LOCAL_PREVIEW_DIR\" scripts/open-local-preview.sh" >&2
    exit 1
  fi
}

has_demo_artifacts() {
  local screen
  for screen in "${DEMO_SCREENS[@]}"; do
    if [[ -f "$OUT_DIR/demo-$screen.png" || -f "$OUT_DIR/demo-$screen.xml" ]]; then
      return 0
    fi
  done
  return 1
}

require_demo_artifacts() {
  local screen
  for screen in "${DEMO_SCREENS[@]}"; do
    require_file "$OUT_DIR/demo-$screen.png"
    require_file "$OUT_DIR/demo-$screen.xml"
    require_samsung_png "$OUT_DIR/demo-$screen.png"
    require_text "demo-$screen.png" "$OUT_DIR/prod-review.html"
    require_text "demo-$screen.png" "$OUT_DIR/presentation-index.html"
    require_text "demo-$screen.png" "$OUT_DIR/presentation-index.txt"
  done

  require_empty_file "$OUT_DIR/demo-copy-leaks.log"
  require_text 'text="Loading Dust"' "$OUT_DIR/demo-loading.xml"
  require_text 'text="Your session expired. Sign in again to continue."' "$OUT_DIR/demo-session-expired.xml"
  require_text 'text="Revenue Team"' "$OUT_DIR/demo-inbox.xml"
  require_text 'text="Pods"' "$OUT_DIR/demo-inbox.xml"
  require_text 'text="Customer Ops"' "$OUT_DIR/demo-inbox.xml"
  require_text 'text="Launch Planning"' "$OUT_DIR/demo-inbox.xml"
  require_text 'text="Coordinate launch follow-ups"' "$OUT_DIR/demo-inbox.xml"
  require_text_top_at_least "Revenue Team" "$OUT_DIR/demo-inbox.xml" 80
  require_text 'content-desc="Refresh conversations"' "$OUT_DIR/demo-inbox.xml"
  require_no_text 'text="Refresh"' "$OUT_DIR/demo-inbox.xml"
  require_no_text 'text="@sales' "$OUT_DIR/demo-inbox.xml"
  require_text 'text="No conversations yet"' "$OUT_DIR/demo-empty-inbox.xml"
  require_text_top_at_least "Revenue Team" "$OUT_DIR/demo-empty-inbox.xml" 80
  require_text 'text="Ask anything or call an agent with @"' "$OUT_DIR/demo-compose.xml"
  require_text 'text="Dust"' "$OUT_DIR/demo-compose.xml"
  require_text 'content-desc="Add context"' "$OUT_DIR/demo-compose.xml"
  require_text 'content-desc="Voice input"' "$OUT_DIR/demo-compose.xml"
  require_no_text 'content-desc="Send"' "$OUT_DIR/demo-compose.xml"
  require_no_text 'text="Quick starts"' "$OUT_DIR/demo-compose.xml"
  require_no_text 'text="Draft customer brief"' "$OUT_DIR/demo-compose.xml"
  require_text 'text="Briefing"' "$OUT_DIR/demo-detail.xml"
  require_text 'text="Ask anything or call an agent with @"' "$OUT_DIR/demo-detail.xml"
  require_text 'content-desc="Conversation files"' "$OUT_DIR/demo-detail.xml"
  require_text 'content-desc="Add context"' "$OUT_DIR/demo-detail.xml"
  require_text 'content-desc="Voice input"' "$OUT_DIR/demo-detail.xml"
  require_no_text 'content-desc="Photos"' "$OUT_DIR/demo-detail.xml"
  require_no_text 'content-desc="Files"' "$OUT_DIR/demo-detail.xml"
  require_no_text 'content-desc="Knowledge"' "$OUT_DIR/demo-detail.xml"
  require_no_text 'content-desc="Send"' "$OUT_DIR/demo-detail.xml"
  require_text 'text="customer-briefing.pdf"' "$OUT_DIR/demo-files.xml"
  require_text 'text="Conversation Files"' "$OUT_DIR/demo-files.xml"
  require_no_text 'text="Close"' "$OUT_DIR/demo-files.xml"
  require_no_text 'text="Document · by @sales"' "$OUT_DIR/demo-files.xml"
  require_text "Demo state screenshots:" "$OUT_DIR/presentation-index.txt"
  require_no_text "Debug demo" "$OUT_DIR/presentation-index.html"
  require_no_text "Debug demo" "$OUT_DIR/presentation-index.txt"
}

has_authenticated_artifacts() {
  local screen
  for screen in "${AUTHENTICATED_SCREENS[@]}"; do
    if [[ -f "$OUT_DIR/authenticated-$screen.png" || -f "$OUT_DIR/authenticated-$screen.xml" ]]; then
      return 0
    fi
  done
  [[ -f "$OUT_DIR/authenticated-review.html" || -f "$OUT_DIR/authenticated-artifacts.txt" ]]
}

require_authenticated_artifacts() {
  local screen
  require_file "$OUT_DIR/authenticated-review.html"
  require_file "$OUT_DIR/authenticated-artifacts.txt"
  require_empty_file "$OUT_DIR/authenticated-failures.log"
  require_text "authenticated-review.html" "$OUT_DIR/presentation-index.txt"
  require_text "authenticated-review.html" "$OUT_DIR/presentation-index.html"

  for screen in "${AUTHENTICATED_SCREENS[@]}"; do
    require_file "$OUT_DIR/authenticated-$screen.png"
    require_file "$OUT_DIR/authenticated-$screen.xml"
    require_samsung_png "$OUT_DIR/authenticated-$screen.png"
    require_text "authenticated-$screen.png" "$OUT_DIR/authenticated-review.html"
    require_text "authenticated-$screen.png" "$OUT_DIR/authenticated-artifacts.txt"
    require_text "authenticated-$screen.xml" "$OUT_DIR/authenticated-artifacts.txt"
    require_text "authenticated-$screen.png" "$OUT_DIR/presentation-index.html"
    require_text "authenticated-$screen.png" "$OUT_DIR/presentation-index.txt"
  done

  require_text 'text="Search conversations"' "$OUT_DIR/authenticated-inbox.xml"
  require_text 'content-desc="Account menu"' "$OUT_DIR/authenticated-inbox.xml"
  require_text 'text="Sign out"' "$OUT_DIR/authenticated-account-menu.xml"
  require_text 'text="Ask anything or call an agent with @"' "$OUT_DIR/authenticated-compose.xml"
  require_text 'text="Dust"' "$OUT_DIR/authenticated-compose.xml"
  require_text 'content-desc="Add context"' "$OUT_DIR/authenticated-compose.xml"
  require_text 'content-desc="Voice input"' "$OUT_DIR/authenticated-compose.xml"
  require_no_text 'content-desc="Send"' "$OUT_DIR/authenticated-compose.xml"
  require_no_text 'text="Quick starts"' "$OUT_DIR/authenticated-compose.xml"
  require_no_text 'text="Draft customer brief"' "$OUT_DIR/authenticated-compose.xml"
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

require_file "$OUT_DIR/presentation-index.html"
require_file "$OUT_DIR/presentation-index.txt"
require_file "$OUT_DIR/prod-review.html"
require_file "$OUT_DIR/prod-artifacts.txt"
require_file "$OUT_DIR/login.png"
require_file "$OUT_DIR/login.xml"
require_file "$OUT_DIR/frame-login.png"
require_file "$OUT_DIR/frame-login.xml"
require_file "$OUT_DIR/sign-in-activities.txt"
require_file "$OUT_DIR/sign-up-activities.txt"
require_file "$OUT_DIR/after-back.xml"
require_file "$OUT_DIR/authenticated-preflight.png"
require_file "$OUT_DIR/authenticated-preflight.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-review.html"
require_file "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
require_file "$LOCAL_PREVIEW_DIR/local-preview-login.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-login.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-account-menu.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-account-menu.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-inbox.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-inbox.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-catch-up-action.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-catch-up-action.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-catch-up-unread.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-catch-up-unread.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-compose.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-agent-picker.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-agent-picker.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-agent-picker-search.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-compose-filled.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-compose-filled.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-detail.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-detail-reply-ime.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-detail-replied.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-detail-replied.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-file-viewer.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-file-viewer.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-launch.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-launch.xml"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu-return.png"
require_file "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu-return.xml"

require_not_older_than "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt" "$OUT_DIR/prod-artifacts.txt" \
  "ADB=\"$ADB\" make presentation-refresh"
require_not_older_than "$OUT_DIR/authenticated-preflight.png" "$OUT_DIR/prod-artifacts.txt" \
  "ADB=\"$ADB\" make presentation-refresh"
require_not_older_than "$OUT_DIR/authenticated-preflight.xml" "$OUT_DIR/prod-artifacts.txt" \
  "ADB=\"$ADB\" make presentation-refresh"
require_not_older_than "$OUT_DIR/presentation-index.txt" "$OUT_DIR/prod-artifacts.txt" \
  "make presentation-index"
require_not_older_than "$OUT_DIR/presentation-index.txt" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt" \
  "make presentation-index"
require_not_older_than "$OUT_DIR/presentation-index.txt" "$OUT_DIR/authenticated-preflight.png" \
  "make presentation-index"

require_samsung_png "$OUT_DIR/login.png"
require_samsung_png "$OUT_DIR/frame-login.png"
require_samsung_png "$OUT_DIR/authenticated-preflight.png"
login_screenshot_bytes="$(wc -c <"$OUT_DIR/login.png" | tr -d ' ')"
if [[ "$login_screenshot_bytes" -lt "$PROD_LOGIN_SCREENSHOT_MIN_BYTES" ]]; then
  echo "Prod login screenshot is too small to be the full login screen: $OUT_DIR/login.png ($login_screenshot_bytes bytes)." >&2
  exit 1
fi

require_text "prod-review.html" "$OUT_DIR/presentation-index.html"
require_text "prod-review.html" "$OUT_DIR/presentation-index.txt"
require_text "local-preview-flow/local-preview-review.html" "$OUT_DIR/presentation-index.html"
require_text "local-preview-review.html" "$OUT_DIR/presentation-index.txt"
require_text "Sample workspace inbox" "$OUT_DIR/presentation-index.html"
require_text "Sample workspace switcher" "$OUT_DIR/presentation-index.html"
require_text "Launch Team inbox" "$OUT_DIR/presentation-index.html"
require_text "Workspace return menu" "$OUT_DIR/presentation-index.html"
require_text "Sample workspace generated file" "$OUT_DIR/presentation-index.html"
require_text "Open sample workspace review" "$OUT_DIR/presentation-index.html"
require_no_text "Preview login" "$OUT_DIR/presentation-index.html"
require_no_text "Preview inbox" "$OUT_DIR/presentation-index.html"
require_no_text "Preview account menu" "$OUT_DIR/presentation-index.html"
require_no_text "Preview compose" "$OUT_DIR/presentation-index.html"
require_no_text "Preview detail" "$OUT_DIR/presentation-index.html"
require_no_text "Preview generated file" "$OUT_DIR/presentation-index.html"
require_text "login.png" "$OUT_DIR/presentation-index.html"
require_text "login.png" "$OUT_DIR/presentation-index.txt"
require_text "frame-login.png" "$OUT_DIR/presentation-index.html"
require_text "frame-login.png" "$OUT_DIR/presentation-index.txt"
require_text "authenticated-preflight.png" "$OUT_DIR/presentation-index.html"
require_text "authenticated-preflight.png" "$OUT_DIR/presentation-index.txt"
require_text "Prod sign-in preflight" "$OUT_DIR/presentation-index.html"
require_text "Real WorkOS E2E:" "$OUT_DIR/presentation-index.html"
require_text "Real WorkOS E2E:" "$OUT_DIR/presentation-index.txt"
require_text "login.png" "$OUT_DIR/prod-review.html"
require_text "frame-login.png" "$OUT_DIR/prod-review.html"
require_text "login.png" "$OUT_DIR/prod-artifacts.txt"
require_text "frame-login.png" "$OUT_DIR/prod-artifacts.txt"
require_text "sign-in-activities.txt" "$OUT_DIR/prod-artifacts.txt"
require_text "sign-up-activities.txt" "$OUT_DIR/prod-artifacts.txt"
require_text "failures.log is empty on success" "$OUT_DIR/prod-artifacts.txt"
require_text "https://dust.tt/api/workos/login" "$OUT_DIR/sign-in-activities.txt"
require_text "redirect_uri=dust%3A%2F%2Fauth" "$OUT_DIR/sign-in-activities.txt"
require_text "screenHint=sign-in" "$OUT_DIR/sign-in-activities.txt"
require_text "https://dust.tt/api/workos/login" "$OUT_DIR/sign-up-activities.txt"
require_text "redirect_uri=dust%3A%2F%2Fauth" "$OUT_DIR/sign-up-activities.txt"
require_text "screenHint=sign-up" "$OUT_DIR/sign-up-activities.txt"
require_text 'text="Sign in"' "$OUT_DIR/after-back.xml"

require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-login.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-account-menu.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-inbox.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-catch-up-action.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-catch-up-unread.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-workspace-launch.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu-return.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-compose.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-agent-picker.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-compose-filled.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-detail.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-detail-replied.png"
require_samsung_png "$LOCAL_PREVIEW_DIR/local-preview-file-viewer.png"

for local_preview_screenshot in login inbox account-menu workspace-menu workspace-launch workspace-menu-return compose compose-filled detail file-viewer; do
  require_text "local-preview-flow/local-preview-$local_preview_screenshot.png" "$OUT_DIR/presentation-index.html"
  require_text "local-preview-$local_preview_screenshot.png" "$OUT_DIR/presentation-index.txt"
  require_text "local-preview-$local_preview_screenshot.png" "$LOCAL_PREVIEW_DIR/local-preview-review.html"
  require_text "local-preview-$local_preview_screenshot.png" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
  require_text "local-preview-$local_preview_screenshot.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
done
for local_preview_screenshot in catch-up-action catch-up-unread agent-picker detail-replied; do
  require_text "local-preview-$local_preview_screenshot.png" "$LOCAL_PREVIEW_DIR/local-preview-review.html"
  require_text "local-preview-$local_preview_screenshot.png" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
  require_text "local-preview-$local_preview_screenshot.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
done
require_text "local-preview-agent-picker-search.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
require_text "local-preview-detail-reply-ime.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
require_text "local-preview-compose-filled.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
require_text "local-preview-workspace-menu.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
require_text "local-preview-workspace-launch.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
require_text "local-preview-workspace-menu-return.xml" "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt"
require_text 'text="Lea Martin"' "$LOCAL_PREVIEW_DIR/local-preview-account-menu.xml"
require_text 'text="lea.martin@dust.tt"' "$LOCAL_PREVIEW_DIR/local-preview-account-menu.xml"
require_no_text "acme.example" "$LOCAL_PREVIEW_DIR/local-preview-account-menu.xml"
require_no_text "@acme." "$LOCAL_PREVIEW_DIR/local-preview-account-menu.xml"
require_text 'text="Sample workspace"' "$LOCAL_PREVIEW_DIR/local-preview-inbox.xml"
require_text 'text="Search conversations"' "$LOCAL_PREVIEW_DIR/local-preview-inbox.xml"
require_text 'content-desc="Switch workspace"' "$LOCAL_PREVIEW_DIR/local-preview-inbox.xml"
for local_preview_xml in "$LOCAL_PREVIEW_DIR"/local-preview-*.xml; do
  require_no_text "@sales" "$local_preview_xml"
done
require_text 'text="Launch Team"' "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu.xml"
require_text 'text="Launch Team"' "$LOCAL_PREVIEW_DIR/local-preview-workspace-launch.xml"
require_text 'text="Finalize launch readiness"' "$LOCAL_PREVIEW_DIR/local-preview-workspace-launch.xml"
require_text 'text="Revenue Team"' "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu-return.xml"
require_text 'content-desc="Refresh conversations"' "$LOCAL_PREVIEW_DIR/local-preview-inbox.xml"
require_no_text 'text="Refresh"' "$LOCAL_PREVIEW_DIR/local-preview-inbox.xml"
require_text 'text="Respond"' "$LOCAL_PREVIEW_DIR/local-preview-catch-up-action.xml"
require_text 'text="Keep for later"' "$LOCAL_PREVIEW_DIR/local-preview-catch-up-action.xml"
require_no_text 'text="Mark as read"' "$LOCAL_PREVIEW_DIR/local-preview-catch-up-action.xml"
require_text 'text="Mark as read"' "$LOCAL_PREVIEW_DIR/local-preview-catch-up-unread.xml"
require_text 'text="Ask anything or call an agent with @"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_text 'text="Dust"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_text 'content-desc="Add context"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_text 'content-desc="Voice input"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_no_text 'content-desc="Send"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_no_text 'content-desc="Switch workspace"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_no_text 'text="Quick starts"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_no_text 'text="Draft customer brief"' "$LOCAL_PREVIEW_DIR/local-preview-compose.xml"
require_text 'content-desc="Selected agent"' "$LOCAL_PREVIEW_DIR/local-preview-agent-picker.xml"
require_text 'content-desc="Clear search"' "$LOCAL_PREVIEW_DIR/local-preview-agent-picker-search.xml"
require_text 'text="Draft customer brief"' "$LOCAL_PREVIEW_DIR/local-preview-compose-filled.xml"
require_text 'content-desc="Send"' "$LOCAL_PREVIEW_DIR/local-preview-compose-filled.xml"
require_no_text 'text="Send"' "$LOCAL_PREVIEW_DIR/local-preview-compose-filled.xml"
require_text 'content-desc="Conversation files"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_text 'text="Ask anything or call an agent with @"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_text 'content-desc="Add context"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_text 'content-desc="Voice input"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_no_text 'content-desc="Switch workspace"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_no_text 'content-desc="Photos"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_no_text 'content-desc="Files"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_no_text 'content-desc="Knowledge"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_no_text 'content-desc="Send"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_text 'text="Briefing"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_no_text 'text="Customer briefing"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_no_text 'text="Draft customer brief"' "$LOCAL_PREVIEW_DIR/local-preview-detail.xml"
require_text 'text="Thanks this helps"' "$LOCAL_PREVIEW_DIR/local-preview-detail-reply-ime.xml"
require_text 'content-desc="Send"' "$LOCAL_PREVIEW_DIR/local-preview-detail-reply-ime.xml"
require_text 'text="Thanks this helps"' "$LOCAL_PREVIEW_DIR/local-preview-detail-replied.xml"
require_text "I drafted a concise response with the recommendation" \
  "$LOCAL_PREVIEW_DIR/local-preview-detail-replied.xml"
require_text "Customer briefing summary" "$LOCAL_PREVIEW_DIR/local-preview-file-viewer.xml"

require_no_text "Try sample workspace" "$OUT_DIR/login.xml"
require_no_text "Try sample workspace" "$OUT_DIR/authenticated-preflight.xml"
require_no_text "Try sample workspace" "$LOCAL_PREVIEW_DIR/local-preview-login.xml"

require_empty_file "$OUT_DIR/failures.log"
require_empty_file "$LOCAL_PREVIEW_DIR/local-preview-copy-leaks.log"
require_empty_file "$LOCAL_PREVIEW_DIR/local-preview-failures.log"
require_no_matching_files "local-preview-*"
require_no_matching_files "auth-resilience-*"
require_no_matching_files "current-prod-login.*"
require_no_matching_files "pkce-login.xml"
require_no_matching_files "authenticated-current.xml"
require_no_matching_files "authenticated-timeout.*"

if [[ "$REQUIRE_DEMO_ARTIFACTS" == "1" ]]; then
  require_demo_artifacts
elif has_demo_artifacts; then
  require_demo_artifacts
fi
if has_demo_artifacts; then
  require_not_older_than "$LOCAL_PREVIEW_DIR/local-preview-artifacts.txt" "$OUT_DIR/demo-copy-leaks.log" \
    "ADB=\"$ADB\" make presentation-refresh"
  require_not_older_than "$OUT_DIR/presentation-index.txt" "$OUT_DIR/demo-copy-leaks.log" \
    "make presentation-index"
fi

if has_authenticated_artifacts; then
  require_authenticated_artifacts
  require_not_older_than "$OUT_DIR/authenticated-artifacts.txt" "$OUT_DIR/prod-artifacts.txt" \
    "ADB=\"$ADB\" make smoke-samsung-authenticated presentation-index"
  require_not_older_than "$OUT_DIR/presentation-index.txt" "$OUT_DIR/authenticated-artifacts.txt" \
    "make presentation-index"
  require_text "Real WorkOS E2E: captured" "$OUT_DIR/presentation-index.html"
  require_text "Real WorkOS E2E: captured" "$OUT_DIR/presentation-index.txt"
  require_no_text "Real WorkOS E2E: not captured" "$OUT_DIR/presentation-index.html"
  require_no_text "Real WorkOS E2E: not captured" "$OUT_DIR/presentation-index.txt"
  require_no_text "Next WorkOS step:" "$OUT_DIR/presentation-index.html"
  require_no_text "Next WorkOS step:" "$OUT_DIR/presentation-index.txt"
else
  require_text "Real WorkOS E2E: not captured" "$OUT_DIR/presentation-index.html"
  require_text "Real WorkOS E2E: not captured" "$OUT_DIR/presentation-index.txt"
  require_text "Next WorkOS step:" "$OUT_DIR/presentation-index.html"
  require_text "Next WorkOS step:" "$OUT_DIR/presentation-index.txt"
  require_text "make presentation-capture-workos" "$OUT_DIR/presentation-index.html"
  require_text "make presentation-capture-workos" "$OUT_DIR/presentation-index.txt"
  require_text "PRESENTATION_AUTH_TIMEOUT_SECONDS=<seconds>" "$OUT_DIR/presentation-index.txt"
  require_no_text "Real WorkOS E2E: captured" "$OUT_DIR/presentation-index.html"
  require_no_text "Real WorkOS E2E: captured" "$OUT_DIR/presentation-index.txt"
fi

build_output="$(find "$ROOT_DIR" \( -name .gradle -o -name .kotlin -o -name build -o -name .DS_Store \) -print -quit)"
if [[ -n "$build_output" ]]; then
  echo "Local generated output remains under $ROOT_DIR: $build_output" >&2
  exit 1
fi

if ! "$ADB" devices >/dev/null 2>&1; then
  echo "adb is not available through ADB=$ADB." >&2
  exit 1
fi

actual_size="$(current_device_size)"
actual_density="$(current_device_density)"
if [[ "$actual_size" != "$SIZE" || "$actual_density" != "$DENSITY" ]]; then
  echo "Expected Samsung viewport $SIZE @ $DENSITY dpi, got ${actual_size:-unknown} @ ${actual_density:-unknown} dpi." >&2
  exit 1
fi

if ! "$ADB" shell dumpsys window | grep -q "$PACKAGE"; then
  echo "The visible Android device is not focused on $PACKAGE." >&2
  exit 1
fi

if "$ADB" logcat -d -v time | grep -Ei "$CRASH_PATTERN"; then
  echo "Dust crash or ANR signatures were found in logcat." >&2
  exit 1
fi

auth_xml="$("$ADB" shell run-as "$PACKAGE" cat shared_prefs/dust_auth.xml 2>/dev/null || true)"
if [[ -z "$auth_xml" || "$auth_xml" != *"<map />"* ]]; then
  echo "Expected empty Dust auth shared preferences after local preview." >&2
  echo "$auth_xml" >&2
  exit 1
fi

"$ADB" shell uiautomator dump /sdcard/dust-presentation-current.xml >/dev/null
"$ADB" pull /sdcard/dust-presentation-current.xml "$CURRENT_UI_XML" >/dev/null
"$ADB" shell rm -f /sdcard/dust-presentation-current.xml >/dev/null
require_current_ui_text 'text="Search conversations"' "$CURRENT_UI_XML"
require_current_ui_text 'text="Sample workspace"' "$CURRENT_UI_XML"
require_current_ui_text 'content-desc="Refresh conversations"' "$CURRENT_UI_XML"
require_no_text 'text="Refresh"' "$CURRENT_UI_XML"

echo "Dust Android presentation pack is complete and the Samsung preview is ready."
