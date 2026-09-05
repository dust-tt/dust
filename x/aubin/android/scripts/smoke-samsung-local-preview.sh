#!/usr/bin/env bash
set -euo pipefail

ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB:-${ANDROID_SDK:+$ANDROID_SDK/platform-tools/adb}}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
ACTIVITY="${ACTIVITY:-.android.MainActivity}"
OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke/local-preview-flow}"
REQUIRE_FULL_IME_SURFACE="${REQUIRE_FULL_IME_SURFACE:-0}"
ORIGINAL_HEADS_UP_NOTIFICATIONS=""
HEADS_UP_SETTING_CAPTURED=0

if [[ -z "${ADB:-}" || ! -x "$ADB" ]]; then
  echo "ADB was not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or ADB." >&2
  exit 1
fi

has_device() {
  "$ADB" devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'
}

restore_test_device_ui() {
  if [[ "$HEADS_UP_SETTING_CAPTURED" != "1" ]]; then
    return
  fi

  if [[ -z "$ORIGINAL_HEADS_UP_NOTIFICATIONS" || "$ORIGINAL_HEADS_UP_NOTIFICATIONS" == "null" ]]; then
    "$ADB" shell settings delete global heads_up_notifications_enabled >/dev/null 2>&1 || true
  else
    "$ADB" shell settings put global heads_up_notifications_enabled \
      "$ORIGINAL_HEADS_UP_NOTIFICATIONS" >/dev/null 2>&1 || true
  fi
}

prepare_test_device_ui() {
  ORIGINAL_HEADS_UP_NOTIFICATIONS="$(
    "$ADB" shell settings get global heads_up_notifications_enabled 2>/dev/null | tr -d '\r' || true
  )"
  HEADS_UP_SETTING_CAPTURED=1
  trap restore_test_device_ui EXIT

  # Setup notifications on a freshly booted AVD can otherwise intercept app taps.
  "$ADB" shell settings put global heads_up_notifications_enabled 0 >/dev/null 2>&1 || true
  "$ADB" shell cmd statusbar collapse >/dev/null 2>&1 || true
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
  local attempt

  for attempt in 1 2; do
    if ! ime_is_active; then
      return 0
    fi
    "$ADB" shell input keyevent KEYCODE_BACK
    for _ in $(seq 1 8); do
      if ! ime_is_active; then
        return 0
      fi
      sleep 0.25
    done
  done
}

clear_focused_editor() {
  "$ADB" shell input keycombination KEYCODE_CTRL_LEFT KEYCODE_A
  "$ADB" shell input keyevent KEYCODE_DEL
}

input_text_slowly() {
  local value="$1"
  local index
  local character

  for ((index = 0; index < ${#value}; index += 1)); do
    character="${value:index:1}"
    if [[ "$character" == " " ]]; then
      "$ADB" shell input keyevent KEYCODE_SPACE
    else
      "$ADB" shell input text "$character"
    fi
    sleep 0.15
  done
}

ime_is_active() {
  "$ADB" shell dumpsys input_method | grep -q 'mInputShown=true'
}

visible_ime_inset_height_px() {
  "$ADB" shell dumpsys window 2>/dev/null |
    tr -d '\r' |
    sed -n -E '/type=ime/!d; /visible=true/!d; s/.*frame=\[[0-9]+,([0-9]+)\]\[[0-9]+,([0-9]+)\].*/\1 \2/p' |
    awk '{ height = $2 - $1; if (height > max) max = height } END { print max + 0 }'
}

device_height_px() {
  "$ADB" shell wm size | tr -d '\r' | awk -F'[:x]' '
    /Override size:/ { height = $3 }
    /Physical size:/ && height == "" { height = $3 }
    END { gsub(/ /, "", height); print height }
  '
}

device_width_px() {
  "$ADB" shell wm size | tr -d '\r' | awk -F'[:x]' '
    /Override size:/ { width = $2 }
    /Physical size:/ && width == "" { width = $2 }
    END { gsub(/ /, "", width); print width }
  '
}

open_conversation_resources_from_edge() {
  local density_dpi
  local edge_offset_px
  local screen_width_px
  local screen_height_px
  local gesture_y_px

  screen_width_px="$(device_width_px)"
  screen_height_px="$(device_height_px)"
  density_dpi="$(
    "$ADB" shell wm density | tr -d '\r' | awk -F': ' '
      /Override density:/ { density = $2 }
      /Physical density:/ && density == "" { density = $2 }
      END { print density }
    '
  )"
  edge_offset_px=$((32 * density_dpi / 160))
  gesture_y_px=$((screen_height_px / 2))
  "$ADB" shell input swipe \
    "$((screen_width_px - edge_offset_px))" "$gesture_y_px" \
    "$((screen_width_px / 3))" "$gesture_y_px" \
    300
}

record_ime_surface_state() {
  local name="$1"
  local active="false"
  local inset_height_px
  local screen_height_px
  local minimum_full_height_px

  if ime_is_active; then
    active="true"
  fi
  inset_height_px="$(visible_ime_inset_height_px)"
  screen_height_px="$(device_height_px)"
  minimum_full_height_px=$((screen_height_px / 8))

  {
    echo "ime_active=$active"
    echo "visible_ime_inset_height_px=$inset_height_px"
    echo "minimum_full_surface_height_px=$minimum_full_height_px"
    echo
    echo "Visible IME inset sources:"
    "$ADB" shell dumpsys window 2>/dev/null | tr -d '\r' | grep 'type=ime' || true
    echo
    echo "Input method state:"
    "$ADB" shell dumpsys input_method 2>/dev/null | tr -d '\r' |
      grep -E 'mInputShown=|mShowRequested=|mCurMethodId=|mCurFocusedWindow=' || true
  } >"$OUT_DIR/${name}.txt"

  if [[ "$REQUIRE_FULL_IME_SURFACE" == "1" ]] &&
    { [[ "$active" != "true" ]] || ((inset_height_px < minimum_full_height_px)); }; then
    echo "Expected a full IME surface on $name, but Android reported active=$active and a ${inset_height_px}px visible inset (minimum ${minimum_full_height_px}px)." >&2
    echo "IME diagnostics: $OUT_DIR/${name}.txt" >&2
    exit 1
  fi
}

wait_for_keyboard_state() {
  local expected="$1"
  local screen_name="$2"

  for _ in $(seq 1 40); do
    if ime_is_active; then
      if [[ "$expected" == "visible" ]]; then
        return 0
      fi
    elif [[ "$expected" == "hidden" ]]; then
      return 0
    fi
    sleep 0.25
  done

  echo "Keyboard did not become $expected on $screen_name." >&2
  return 1
}

assert_editor_focused() {
  local xml_path="$1"

  if ! tr '<' '\n' <"$xml_path" | awk '
    /class="android.widget.EditText"/ && /focused="true"/ { found = 1 }
    END { exit(found ? 0 : 1) }
  '; then
    echo "Expected a focused editor in $xml_path." >&2
    exit 1
  fi
}

assert_editor_not_focused() {
  local xml_path="$1"

  if tr '<' '\n' <"$xml_path" | awk '
    /class="android.widget.EditText"/ && /focused="true"/ { found = 1 }
    END { exit(found ? 0 : 1) }
  '; then
    echo "Expected no focused editor in $xml_path." >&2
    exit 1
  fi
}

assert_text_in_lower_half() {
  local text="$1"
  local xml_path="$2"
  local bounds
  local screen_height_px
  local x1 y1 x2 y2

  bounds="$(
    tr '<' '\n' <"$xml_path" | awk -v expected="$text" '
      index($0, "text=\"" expected "\"") {
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
    echo "Could not find '$text' bounds in $xml_path." >&2
    exit 1
  fi

  screen_height_px="$(device_height_px)"
  read -r x1 y1 x2 y2 <<<"$bounds"
  if ((y1 + y2 <= screen_height_px)); then
    echo "Expected '$text' in the lower half of $xml_path, found vertical bounds [$y1,$y2] on a ${screen_height_px}px screen." >&2
    exit 1
  fi
}

assert_text_docked_to_available_bottom() {
  local text="$1"
  local xml_path="$2"
  local bounds
  local screen_height_px
  local ime_inset_height_px=0
  local available_bottom_px
  local maximum_gap_px=360
  local x1 y1 x2 y2

  bounds="$(
    tr '<' '\n' <"$xml_path" | awk -v expected="$text" '
      index($0, "text=\"" expected "\"") {
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
    echo "Could not find '$text' bounds in $xml_path." >&2
    exit 1
  fi

  screen_height_px="$(device_height_px)"
  if ime_is_active; then
    ime_inset_height_px="$(visible_ime_inset_height_px)"
  fi
  available_bottom_px=$((screen_height_px - ime_inset_height_px))
  read -r x1 y1 x2 y2 <<<"$bounds"
  if ((y2 > available_bottom_px || available_bottom_px - y2 > maximum_gap_px)); then
    echo "Expected '$text' to stay docked near the available bottom of $xml_path; text ended at $y2 and the available bottom was $available_bottom_px." >&2
    exit 1
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
    if xml_has_exact_text "$text" "$OUT_DIR/${screen_name}.xml"; then
      sleep 1
      capture_screen "$screen_name"
      xml_has_exact_text "$text" "$OUT_DIR/${screen_name}.xml"
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
    if xml_has_exact_text "$text" "$OUT_DIR/${screen_name}.xml"; then
      sleep 1
      capture_ui "$screen_name"
      xml_has_exact_text "$text" "$OUT_DIR/${screen_name}.xml"
      return
    fi
    sleep 1
  done

  echo "Text '$text' did not appear." >&2
  print_latest_texts "$OUT_DIR/${screen_name}.xml"
  exit 1
}

remove_composer_selection() {
  local label="$1"
  local screen_name="$2"
  local removing_screen="${screen_name}-removing"
  local removing_xml="$OUT_DIR/${removing_screen}.xml"
  local editor_node

  for _ in 1 2 3; do
    capture_ui "$removing_screen"
    if ! grep -Fq "content-desc=\"Remove $label\"" "$removing_xml"; then
      break
    fi
    tap_content_desc_from_dump "Remove $label" "$removing_xml"
    sleep 1
  done

  capture_ui "$screen_name"
  if grep -Fq "content-desc=\"Remove $label\"" "$OUT_DIR/${screen_name}.xml"; then
    echo "Selected composer item '$label' could not be removed." >&2
    exit 1
  fi

  if ! xml_has_exact_text "Ask anything or call an agent with @" "$OUT_DIR/${screen_name}.xml"; then
    editor_node="$(
      tr '<' '\n' <"$OUT_DIR/${screen_name}.xml" \
        | grep -m 1 'class="android.widget.EditText"' || true
    )"
    # A visible emulator can receive unrelated host-keyboard input during the smoke run.
    if [[ "$editor_node" == *'focused="true"'* && "$editor_node" != *'text=""'* ]]; then
      "$ADB" shell input keycombination KEYCODE_CTRL_LEFT KEYCODE_A
      "$ADB" shell input keyevent KEYCODE_DEL
      sleep 1
    fi
  fi

  wait_for_ui_text "Ask anything or call an agent with @" "$screen_name"
}

wait_for_check_state() {
  local expected="$1"
  local screen_name="$2"

  for _ in 1 2 3 4 5 6 7 8; do
    capture_screen "$screen_name"
    if grep -q "checkable=\"true\" checked=\"$expected\"" "$OUT_DIR/${screen_name}.xml"; then
      return
    fi
    sleep 1
  done

  echo "No checkable control became checked=$expected on $screen_name." >&2
  exit 1
}

xml_has_exact_text() {
  local text="$1"
  local xml_path="$2"
  local escaped_text

  escaped_text="$(
    printf '%s' "$text" |
      sed -e 's/&/\&amp;/g' -e 's/"/\&quot;/g' -e "s/'/\&apos;/g" -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
  )"
  grep -Fq "text=\"$escaped_text\"" "$xml_path"
}

wait_for_content_desc() {
  local description="$1"
  local screen_name="$2"

  for _ in 1 2 3 4 5 6 7 8; do
    capture_screen "$screen_name"
    if grep -Fq "content-desc=\"$description\"" "$OUT_DIR/${screen_name}.xml"; then
      sleep 2
      capture_ui "$screen_name"
      grep -Fq "content-desc=\"$description\"" "$OUT_DIR/${screen_name}.xml"
      settle_full_screen_compositor
      capture_pixels "$screen_name"
      return
    fi
    sleep 1
  done

  echo "Content description '$description' did not appear." >&2
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

assert_no_conversation_avatars() {
  local xml_path="$1"
  local allowed_user_name="${2:-}"
  local avatar_description

  while IFS= read -r avatar_description; do
    [[ -z "$avatar_description" ]] && continue
    if [[ "$avatar_description" != "content-desc=\"${allowed_user_name} avatar\"" ]]; then
      echo "Conversation lists must not render author avatars: $avatar_description" >&2
      exit 1
    fi
  done < <(grep -oE 'content-desc="[^"]+ avatar"' "$xml_path" || true)
}

assert_compact_row_spacing() {
  local xml_path="$1"
  local first_title="$2"
  local second_title="$3"
  local density
  local first_top_px
  local second_top_px
  local title_gap_px
  local maximum_gap_px

  density="$(
    "$ADB" shell wm density | tr -d '\r' | awk -F': ' '
      /Override density:/ { density = $2 }
      /Physical density:/ && density == "" { density = $2 }
      END { print density }
    '
  )"
  first_top_px="$(text_top_px "$first_title" "$xml_path")"
  second_top_px="$(text_top_px "$second_title" "$xml_path")"
  # Two-line conversation rows are at least 56dp, plus their divider.
  maximum_gap_px=$(((64 * density + 159) / 160))

  if [[ -z "$first_top_px" || -z "$second_top_px" ]]; then
    echo "Could not measure row title spacing in $xml_path." >&2
    exit 1
  fi

  title_gap_px=$((second_top_px - first_top_px))
  if ((title_gap_px > maximum_gap_px)); then
    echo "Row titles are ${title_gap_px}px apart, expected no more than ${maximum_gap_px}px (64dp)." >&2
    exit 1
  fi
}

text_top_px() {
  local text="$1"
  local xml_path="$2"

  tr '<' '\n' <"$xml_path" | awk -v expected="$text" '
    index($0, "text=\"" expected "\"") {
      if (match($0, /bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"/)) {
        bounds = substr($0, RSTART, RLENGTH)
        gsub(/[^0-9]+/, " ", bounds)
        gsub(/^ +| +$/, "", bounds)
        split(bounds, coordinates, " ")
        print coordinates[2]
        exit
      }
    }
  '
}

open_local_preview_inbox() {
  "$ADB" shell am start -S -a android.intent.action.VIEW -d "dust://local-preview" -p "$PACKAGE" >/dev/null
  wait_for_text "Search" "local-preview-inbox"
  grep -q 'text="Sample workspace"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'text="Revenue Team"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'content-desc="Switch workspace"' "$OUT_DIR/local-preview-inbox.xml"
  assert_no_conversation_avatars "$OUT_DIR/local-preview-inbox.xml" "Lea Martin"
  grep -q 'text="Prepare the Q3 customer briefing"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'text="Coordinate launch follow-ups"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'text="Summarize workspace changes"' "$OUT_DIR/local-preview-inbox.xml"
  assert_compact_row_spacing \
    "$OUT_DIR/local-preview-inbox.xml" \
    "Prepare the Q3 customer briefing" \
    "Coordinate launch follow-ups"
}

assert_pods_collapsed_by_default() {
  grep -q 'text="Pods"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'content-desc="Expand pods"' "$OUT_DIR/local-preview-inbox.xml"
  if grep -q 'text="Customer Ops"\|text="Launch Planning"' "$OUT_DIR/local-preview-inbox.xml"; then
    echo "Pod links should be collapsed when the inbox opens." >&2
    exit 1
  fi

  tap_content_desc_from_dump "Expand pods" "$OUT_DIR/local-preview-inbox.xml"
  wait_for_text "Customer Ops" "local-preview-pods-expanded"
  grep -q 'text="Launch Planning"' "$OUT_DIR/local-preview-pods-expanded.xml"
  grep -q 'content-desc="Collapse pods"' "$OUT_DIR/local-preview-pods-expanded.xml"
  assert_compact_row_spacing \
    "$OUT_DIR/local-preview-pods-expanded.xml" \
    "Customer Ops" \
    "Launch Planning"
  tap_content_desc_from_dump "Collapse pods" "$OUT_DIR/local-preview-pods-expanded.xml"
  wait_for_text "Search" "local-preview-inbox"
  if grep -q 'text="Customer Ops"\|text="Launch Planning"' "$OUT_DIR/local-preview-inbox.xml"; then
    echo "Pod links should be hidden after collapsing the section." >&2
    exit 1
  fi
}

assert_pod_flow() {
  tap_content_desc_from_dump "Expand pods" "$OUT_DIR/local-preview-inbox.xml"
  wait_for_text "Customer Ops" "local-preview-pods-expanded"
  tap_text_from_dump "Customer Ops" "$OUT_DIR/local-preview-pods-expanded.xml"
  wait_for_text "Search" "local-preview-pod"
  grep -q 'text="Customer Ops"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'content-desc="New conversation"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'text="Chats"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'text="Tasks"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'text="Files"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'text="Settings"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'text="Account briefing.frame"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'content-desc="Frame preview"' "$OUT_DIR/local-preview-pod.xml"
  grep -q 'content-desc="Open pinned Frame"' "$OUT_DIR/local-preview-pod.xml"
  assert_no_conversation_avatars "$OUT_DIR/local-preview-pod.xml"
  assert_text_in_lower_half "Search" "$OUT_DIR/local-preview-pod.xml"

  tap_content_desc_from_dump "Open pinned Frame" "$OUT_DIR/local-preview-pod.xml"
  wait_for_text "Customer briefing" "local-preview-pod-frame"
  grep -q 'text="Account briefing.frame"' "$OUT_DIR/local-preview-pod-frame.xml"
  grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-pod-frame.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_text "Search" "local-preview-pod"

  tap_text_from_dump "Tasks" "$OUT_DIR/local-preview-pod.xml"
  wait_for_text "Add a task" "local-preview-pod-tasks"
  grep -q 'text="Review the Q3 customer briefing"' "$OUT_DIR/local-preview-pod-tasks.xml"
  grep -q 'content-desc="Mark task as done"' "$OUT_DIR/local-preview-pod-tasks.xml"
  tap_text_from_dump "Add a task" "$OUT_DIR/local-preview-pod-tasks.xml"
  wait_for_keyboard_state "visible" "Pod task composer"
  input_text_slowly "Verify owners"
  wait_for_ui_text "Verify owners" "local-preview-pod-task-draft"
  "$ADB" shell input keyevent KEYCODE_ENTER
  wait_for_text "Verify owners" "local-preview-pod-task-added"
  wait_for_keyboard_state "visible" "Pod task after keyboard send"
  assert_editor_focused "$OUT_DIR/local-preview-pod-task-added.xml"

  tap_text_from_dump "Files" "$OUT_DIR/local-preview-pod-task-added.xml"
  wait_for_text "Pod files" "local-preview-pod-files"
  wait_for_keyboard_state "hidden" "Pod files"
  assert_editor_not_focused "$OUT_DIR/local-preview-pod-files.xml"
  grep -q 'text="Research"' "$OUT_DIR/local-preview-pod-files.xml"
  grep -q 'text="Account briefing.frame"' "$OUT_DIR/local-preview-pod-files.xml"
  grep -q 'text="Customer brief.pdf"' "$OUT_DIR/local-preview-pod-files.xml"
  grep -q 'content-desc="Unpin Frame"' "$OUT_DIR/local-preview-pod-files.xml"

  tap_text_from_dump "Research" "$OUT_DIR/local-preview-pod-files.xml"
  wait_for_text "Review notes.md" "local-preview-pod-folder"
  grep -q 'text="Account health.png"' "$OUT_DIR/local-preview-pod-folder.xml"
  grep -q 'content-desc="Parent folder"' "$OUT_DIR/local-preview-pod-folder.xml"
  tap_content_desc_from_dump "Parent folder" "$OUT_DIR/local-preview-pod-folder.xml"
  wait_for_text "Pod files" "local-preview-pod-files"

  tap_content_desc_from_dump "Unpin Frame" "$OUT_DIR/local-preview-pod-files.xml"
  wait_for_content_desc "Pin Frame" "local-preview-pod-files-unpinned"
  tap_content_desc_from_dump "Pin Frame" "$OUT_DIR/local-preview-pod-files-unpinned.xml"
  wait_for_content_desc "Unpin Frame" "local-preview-pod-files"

  wait_for_text "Pod files" "local-preview-pod-files"
  if grep -q 'content-desc="Parent folder"' "$OUT_DIR/local-preview-pod-files.xml"; then
    echo "Expected the Pod file root before opening Account briefing.frame." >&2
    exit 1
  fi
  tap_text_from_dump "Account briefing.frame" "$OUT_DIR/local-preview-pod-files.xml"
  wait_for_text "Customer briefing" "local-preview-pod-frame-from-files"
  grep -q 'text="Account briefing.frame"' "$OUT_DIR/local-preview-pod-frame-from-files.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_text "Pod files" "local-preview-pod-files"

  tap_text_from_dump "Settings" "$OUT_DIR/local-preview-pod-files.xml"
  wait_for_text "Notifications" "local-preview-pod-settings"
  grep -q 'text="Description"' "$OUT_DIR/local-preview-pod-settings.xml"
  grep -q 'text="Access"' "$OUT_DIR/local-preview-pod-settings.xml"
  grep -q 'text="Members"' "$OUT_DIR/local-preview-pod-settings.xml"
  grep -q 'text="Automatic task suggestions"' "$OUT_DIR/local-preview-pod-settings.xml"
  grep -q 'text="Advanced settings"' "$OUT_DIR/local-preview-pod-settings.xml"
  grep -q 'checkable="true" checked="false"' "$OUT_DIR/local-preview-pod-settings.xml"

  tap_text_from_dump "Members" "$OUT_DIR/local-preview-pod-settings.xml"
  wait_for_text "Antoine Milkoff" "local-preview-pod-members"
  grep -q 'content-desc="Antoine Milkoff avatar"' "$OUT_DIR/local-preview-pod-members.xml"
  grep -q 'content-desc="Lea Martin avatar"' "$OUT_DIR/local-preview-pod-members.xml"
  grep -q 'content-desc="Zoe Martin avatar"' "$OUT_DIR/local-preview-pod-members.xml"
  grep -q 'text="Editor"' "$OUT_DIR/local-preview-pod-members.xml"
  tap_content_desc_from_dump "Close" "$OUT_DIR/local-preview-pod-members.xml"
  wait_for_text "Notifications" "local-preview-pod-settings"

  tap_text_from_dump "Automatic task suggestions" "$OUT_DIR/local-preview-pod-settings.xml"
  wait_for_check_state "true" "local-preview-pod-settings-task-suggestions"
  tap_text_from_dump "Notifications" "$OUT_DIR/local-preview-pod-settings-task-suggestions.xml"
  wait_for_text "Only mentions" "local-preview-pod-notifications"
  grep -q 'text="All messages"' "$OUT_DIR/local-preview-pod-notifications.xml"
  grep -q 'text="Nothing"' "$OUT_DIR/local-preview-pod-notifications.xml"
  tap_content_desc_from_dump "Close" "$OUT_DIR/local-preview-pod-notifications.xml"
  wait_for_text "Notifications" "local-preview-pod-settings-task-suggestions"

  tap_text_from_dump "Chats" "$OUT_DIR/local-preview-pod-settings-task-suggestions.xml"
  wait_for_text "Search" "local-preview-pod"
  tap_text_from_dump "Search" "$OUT_DIR/local-preview-pod.xml"
  wait_for_keyboard_state "visible" "pod search"
  capture_screen "local-preview-pod-search-focused"
  assert_editor_focused "$OUT_DIR/local-preview-pod-search-focused.xml"
  assert_text_docked_to_available_bottom \
    "Search conversations" \
    "$OUT_DIR/local-preview-pod-search-focused.xml"
  grep -q 'content-desc="Exit search"' "$OUT_DIR/local-preview-pod-search-focused.xml"

  hide_keyboard_if_visible
  wait_for_keyboard_state "hidden" "pod search after Back"
  wait_for_ui_text "Search" "local-preview-pod"
  assert_editor_not_focused "$OUT_DIR/local-preview-pod.xml"
  tap_content_desc_from_dump "Back" "$OUT_DIR/local-preview-pod.xml"
  wait_for_text "Customer Ops" "local-preview-pods-expanded"
  tap_content_desc_from_dump "Collapse pods" "$OUT_DIR/local-preview-pods-expanded.xml"
  wait_for_text "Search" "local-preview-inbox"
}

assert_bottom_search_flow() {
  assert_text_in_lower_half "Search" "$OUT_DIR/local-preview-inbox.xml"
  tap_text_from_dump "Search" "$OUT_DIR/local-preview-inbox.xml"
  wait_for_keyboard_state "visible" "inbox search"
  capture_screen "local-preview-inbox-search-focused"
  assert_editor_focused "$OUT_DIR/local-preview-inbox-search-focused.xml"
  assert_text_docked_to_available_bottom \
    "Search conversations" \
    "$OUT_DIR/local-preview-inbox-search-focused.xml"
  grep -q 'content-desc="Exit search"' "$OUT_DIR/local-preview-inbox-search-focused.xml"
  if grep -q 'content-desc="New conversation"' \
    "$OUT_DIR/local-preview-inbox-search-focused.xml"; then
    echo "Focused inbox search should hide the new-conversation action." >&2
    exit 1
  fi

  hide_keyboard_if_visible
  wait_for_keyboard_state "hidden" "inbox search after Back"
  capture_ui "local-preview-inbox"
  assert_editor_not_focused "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'text="Search"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'text="Catch up"' "$OUT_DIR/local-preview-inbox.xml"
  grep -q 'content-desc="New conversation"' "$OUT_DIR/local-preview-inbox.xml"
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

  if grep -Eih 'Aubin|Local preview|by local|prodDebug|production API|Android QA|mobile review|Samsung screenshots|demo build|acme\.example|@acme\.|@sales|\.example' "$OUT_DIR"/local-preview-*.xml >"$leak_log"; then
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
  grep -q 'text="New conversation"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'text="@Dust"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'text="General purpose workspace agent"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Dust avatar"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Add tools and skills"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Add context"' "$OUT_DIR/local-preview-compose.xml"
  grep -q 'content-desc="Voice input"' "$OUT_DIR/local-preview-compose.xml"
  if grep -q 'text="Agents"\|text="Sales Team"\|text="Launch Team"' "$OUT_DIR/local-preview-compose.xml"; then
    echo "New conversation should use a focused mobile empty state instead of an agent browser grid." >&2
    exit 1
  fi
  if grep -q 'content-desc="Send"\|text="Quick starts"\|text="Draft customer brief"' "$OUT_DIR/local-preview-compose.xml"; then
    echo "An empty mobile composer should show voice input without legacy quick starts or an enabled send action." >&2
    exit 1
  fi

  tap_content_desc_from_dump "Add context" "$OUT_DIR/local-preview-compose.xml"
  wait_for_ui_text "Tools & skills" "local-preview-compose-context-menu"
  grep -q 'text="Photos"' "$OUT_DIR/local-preview-compose-context-menu.xml"
  grep -q 'text="Files"' "$OUT_DIR/local-preview-compose-context-menu.xml"
  grep -q 'text="Knowledge"' "$OUT_DIR/local-preview-compose-context-menu.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_ui_text "Ask anything or call an agent with @" "local-preview-compose"
  wait_for_keyboard_state "visible" "compose after context menu"
  capture_ui "local-preview-compose"
  assert_editor_focused "$OUT_DIR/local-preview-compose.xml"
}

assert_catch_up_flow() {
  tap_text_from_dump "Catch up" "$OUT_DIR/local-preview-inbox.xml"
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

  grep -q 'text="Account briefing"' "$OUT_DIR/local-preview-catch-up-action.xml"
  tap_text_containing_from_dump "Account briefing" "$OUT_DIR/local-preview-catch-up-action.xml"
  wait_for_text "Customer briefing" "local-preview-catch-up-frame"
  grep -q 'text="Account briefing"' "$OUT_DIR/local-preview-catch-up-frame.xml"
  grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-catch-up-frame.xml"
  if grep -q 'text="Frame unavailable"\|text="Try again"' "$OUT_DIR/local-preview-catch-up-frame.xml"; then
    echo "Catch Up Frame should render instead of ending in an error state." >&2
    exit 1
  fi
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_text "Respond" "local-preview-catch-up-action"
  grep -q 'text="1 of 2"' "$OUT_DIR/local-preview-catch-up-action.xml"

  tap_text_from_dump "Keep for later" "$OUT_DIR/local-preview-catch-up-action.xml"
  wait_for_text "Mark as read" "local-preview-catch-up-unread"
  grep -q 'text="2 of 2"' "$OUT_DIR/local-preview-catch-up-unread.xml"
  grep -q 'text="Coordinate launch follow-ups"' "$OUT_DIR/local-preview-catch-up-unread.xml"
  grep -q 'text="Keep for later"' "$OUT_DIR/local-preview-catch-up-unread.xml"

  tap_text_from_dump "Keep for later" "$OUT_DIR/local-preview-catch-up-unread.xml"
  wait_for_text "Review complete" "local-preview-catch-up-complete"
  grep -q '2 kept for later' "$OUT_DIR/local-preview-catch-up-complete.xml"
  tap_text_from_dump "Undo" "$OUT_DIR/local-preview-catch-up-complete.xml"
  wait_for_text "Mark as read" "local-preview-catch-up-unread"
  grep -q 'text="2 of 2"' "$OUT_DIR/local-preview-catch-up-unread.xml"
  tap_text_from_dump "Keep for later" "$OUT_DIR/local-preview-catch-up-unread.xml"
  wait_for_text "Review complete" "local-preview-catch-up-complete"
  tap_text_from_dump "Done" "$OUT_DIR/local-preview-catch-up-complete.xml"
  wait_for_text "Search" "local-preview-inbox"
  tap_text_from_dump "Catch up" "$OUT_DIR/local-preview-inbox.xml"
  wait_for_text "Respond" "local-preview-catch-up-reopened"
  grep -q 'text="1 of 2"' "$OUT_DIR/local-preview-catch-up-reopened.xml"
  tap_content_desc_from_dump "Close" "$OUT_DIR/local-preview-catch-up-reopened.xml"
  wait_for_text "Search" "local-preview-inbox"
}

assert_agent_picker_flow() {
  tap_content_desc_from_dump "Select agent: Dust" "$OUT_DIR/local-preview-compose.xml"
  wait_for_text "Select an agent" "local-preview-agent-picker"
  wait_for_keyboard_state "hidden" "agent picker"
  grep -q 'content-desc="Selected agent"' "$OUT_DIR/local-preview-agent-picker.xml"
  grep -q 'text="Sales Team"' "$OUT_DIR/local-preview-agent-picker.xml"

  tap_text_from_dump "Search agents" "$OUT_DIR/local-preview-agent-picker.xml"
  wait_for_keyboard_state "visible" "agent picker search"
  input_text_slowly "Sales"
  wait_for_text "Sales" "local-preview-agent-picker-search"
  grep -q 'content-desc="Clear search"' "$OUT_DIR/local-preview-agent-picker-search.xml"
  grep -q 'text="Sales Team"' "$OUT_DIR/local-preview-agent-picker-search.xml"
  tap_content_desc_from_dump "Clear search" "$OUT_DIR/local-preview-agent-picker-search.xml"
  wait_for_text "Select an agent" "local-preview-agent-picker-cleared"
  grep -q 'text="Dust"' "$OUT_DIR/local-preview-agent-picker-cleared.xml"
  tap_text_from_dump "Dust" "$OUT_DIR/local-preview-agent-picker-cleared.xml"
  wait_for_ui_text "Ask anything or call an agent with @" "local-preview-compose"
  wait_for_keyboard_state "visible" "compose after agent picker"
  capture_ui "local-preview-compose"
  assert_editor_focused "$OUT_DIR/local-preview-compose.xml"
}

assert_agent_mention_flow() {
  "$ADB" shell input text "@"
  wait_for_ui_text "Agents" "local-preview-compose-agent-mention"
  wait_for_keyboard_state "visible" "agent mention suggestions"
  capture_screen "local-preview-compose-agent-mention"
  assert_editor_focused "$OUT_DIR/local-preview-compose-agent-mention.xml"
  grep -q 'content-desc="Select agent Dust"' "$OUT_DIR/local-preview-compose-agent-mention.xml"
  grep -q 'content-desc="Select agent Sales Team"' "$OUT_DIR/local-preview-compose-agent-mention.xml"

  input_text_slowly "du"
  wait_for_ui_text "@du" "local-preview-compose-agent-mention-filtered"
  wait_for_keyboard_state "visible" "filtered agent mention suggestions"
  grep -q 'content-desc="Select agent Dust"' "$OUT_DIR/local-preview-compose-agent-mention-filtered.xml"
  if grep -q 'content-desc="Select agent Sales Team"' "$OUT_DIR/local-preview-compose-agent-mention-filtered.xml"; then
    echo "The agent mention menu did not filter its results." >&2
    exit 1
  fi

  tap_content_desc_from_dump \
    "Select agent Dust" \
    "$OUT_DIR/local-preview-compose-agent-mention-filtered.xml"
  wait_for_ui_text "Ask anything or call an agent with @" "local-preview-compose"
  wait_for_keyboard_state "visible" "compose after agent mention selection"
  assert_editor_focused "$OUT_DIR/local-preview-compose.xml"
  if grep -q 'text="@du"\|text="Agents"' "$OUT_DIR/local-preview-compose.xml"; then
    echo "Selecting an agent should remove the mention query and close the suggestions." >&2
    exit 1
  fi
}

assert_capability_selector_focus_flow() {
  tap_content_desc_from_dump "Add tools and skills" "$OUT_DIR/local-preview-compose.xml"
  wait_for_ui_text "Tools & skills" "local-preview-compose-capabilities"
  wait_for_keyboard_state "hidden" "tools and skills selector"
  assert_editor_not_focused "$OUT_DIR/local-preview-compose-capabilities.xml"

  tap_text_from_dump "Search tools and skills" "$OUT_DIR/local-preview-compose-capabilities.xml"
  wait_for_keyboard_state "visible" "tools and skills search"
  input_text_slowly "Notion"
  wait_for_ui_text "Notion" "local-preview-compose-capabilities-filtered"
  assert_editor_focused "$OUT_DIR/local-preview-compose-capabilities-filtered.xml"
  tap_text_from_dump "Notion" "$OUT_DIR/local-preview-compose-capabilities-filtered.xml" last

  wait_for_content_desc "Remove Notion" "local-preview-compose-capability-selected"
  wait_for_keyboard_state "visible" "compose after selecting a tool"
  assert_editor_focused "$OUT_DIR/local-preview-compose-capability-selected.xml"
  remove_composer_selection "Notion" "local-preview-compose"
}

assert_knowledge_selector_focus_flow() {
  tap_content_desc_from_dump "Add context" "$OUT_DIR/local-preview-compose.xml"
  wait_for_ui_text "Add context" "local-preview-compose-context-menu"
  wait_for_keyboard_state "hidden" "context menu"
  tap_text_from_dump "Knowledge" "$OUT_DIR/local-preview-compose-context-menu.xml"
  wait_for_ui_text "Knowledge" "local-preview-compose-knowledge"
  wait_for_keyboard_state "visible" "knowledge selector"
  assert_editor_focused "$OUT_DIR/local-preview-compose-knowledge.xml"
  input_text_slowly "account"
  wait_for_ui_text "Q3 account plan" "local-preview-compose-knowledge-filtered"
  assert_editor_focused "$OUT_DIR/local-preview-compose-knowledge-filtered.xml"
  tap_text_from_dump "Q3 account plan" "$OUT_DIR/local-preview-compose-knowledge-filtered.xml"

  wait_for_content_desc "Remove Q3 account plan" "local-preview-compose-knowledge-selected"
  wait_for_keyboard_state "visible" "compose after selecting knowledge"
  assert_editor_focused "$OUT_DIR/local-preview-compose-knowledge-selected.xml"
  remove_composer_selection "Q3 account plan" "local-preview-compose"
}

assert_detail_scroll_dismisses_keyboard() {
  tap_text_from_dump "Ask anything or call an agent with @" "$OUT_DIR/local-preview-detail.xml"
  wait_for_keyboard_state "visible" "detail before message scroll"
  "$ADB" shell input swipe 540 1050 540 1150 300
  wait_for_keyboard_state "hidden" "detail after message scroll"
  capture_ui "local-preview-detail"
  assert_editor_not_focused "$OUT_DIR/local-preview-detail.xml"
}

assert_skill_slash_flow() {
  local screen_prefix="$1"
  local slash_screen="${screen_prefix}-skill-slash"
  local filtered_screen="${screen_prefix}-skill-slash-filtered"
  local selected_screen="${screen_prefix}-skill-selected"

  "$ADB" shell input text "/"
  wait_for_ui_text "Skills" "$slash_screen"
  wait_for_keyboard_state "visible" "$screen_prefix slash suggestions"
  capture_screen "$slash_screen"
  assert_editor_focused "$OUT_DIR/${slash_screen}.xml"
  grep -q 'text="Customer briefing"' "$OUT_DIR/${slash_screen}.xml"
  grep -q 'text="Meeting follow-up"' "$OUT_DIR/${slash_screen}.xml"
  grep -q 'text="Workspace digest"' "$OUT_DIR/${slash_screen}.xml"
  grep -q 'content-desc="Select skill Customer briefing"' "$OUT_DIR/${slash_screen}.xml"
  if grep -q 'text="Notion"\|text="Slack"' "$OUT_DIR/${slash_screen}.xml"; then
    echo "The skill slash menu should not mix tools into its results." >&2
    exit 1
  fi

  input_text_slowly "follow"
  wait_for_ui_text "Meeting follow-up" "$filtered_screen"
  capture_screen "$filtered_screen"
  grep -q 'content-desc="Select skill Meeting follow-up"' "$OUT_DIR/${filtered_screen}.xml"
  if grep -q 'text="Customer briefing"\|text="Workspace digest"' "$OUT_DIR/${filtered_screen}.xml"; then
    echo "The skill slash menu did not filter its results." >&2
    exit 1
  fi

  tap_content_desc_from_dump "Select skill Meeting follow-up" "$OUT_DIR/${filtered_screen}.xml"
  wait_for_content_desc "Remove Meeting follow-up" "$selected_screen"
  wait_for_keyboard_state "visible" "$screen_prefix after skill selection"
  assert_editor_focused "$OUT_DIR/${selected_screen}.xml"
  grep -q 'content-desc="Send"' "$OUT_DIR/${selected_screen}.xml"
  if grep -q 'text="/follow"\|text="Skills"' "$OUT_DIR/${selected_screen}.xml"; then
    echo "Selecting a skill should replace the slash query and close the suggestions." >&2
    exit 1
  fi

  remove_composer_selection "Meeting follow-up" "$screen_prefix"
  wait_for_keyboard_state "visible" "$screen_prefix after removing skill"
  capture_ui "$screen_prefix"
  assert_editor_focused "$OUT_DIR/${screen_prefix}.xml"
}

assert_inactive_composer_stays_inactive() {
  hide_keyboard_if_visible
  wait_for_keyboard_state "hidden" "compose after Back"
  wait_for_ui_text "Ask anything or call an agent with @" "local-preview-compose-ime-hidden"
  assert_editor_not_focused "$OUT_DIR/local-preview-compose-ime-hidden.xml"
  assert_text_docked_to_available_bottom \
    "Ask anything or call an agent with @" \
    "$OUT_DIR/local-preview-compose-ime-hidden.xml"
  if grep -q 'text="Search"' "$OUT_DIR/local-preview-compose-ime-hidden.xml"; then
    echo "Back should dismiss the compose keyboard before navigating to the inbox." >&2
    exit 1
  fi

  tap_content_desc_from_dump "Select agent: Dust" "$OUT_DIR/local-preview-compose-ime-hidden.xml"
  wait_for_text "Select an agent" "local-preview-agent-picker-inactive"
  wait_for_keyboard_state "hidden" "inactive agent picker"
  tap_text_from_dump "Dust" "$OUT_DIR/local-preview-agent-picker-inactive.xml"
  wait_for_ui_text "Ask anything or call an agent with @" "local-preview-compose"
  wait_for_keyboard_state "hidden" "compose after inactive agent picker"
  capture_ui "local-preview-compose"
  assert_editor_not_focused "$OUT_DIR/local-preview-compose.xml"
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
  tap_text_from_dump "Search" "$OUT_DIR/local-preview-inbox.xml"
  wait_for_keyboard_state "visible" "workspace search"
  input_text_slowly "Launch"
  wait_for_ui_text "Launch" "local-preview-workspace-search"
  tap_text_from_dump "Revenue Team" "$OUT_DIR/local-preview-workspace-search.xml"
  wait_for_keyboard_state "hidden" "workspace switcher"
  sleep 1
  capture_screen "local-preview-workspace-menu"
  grep -q 'text="Launch Team"' "$OUT_DIR/local-preview-workspace-menu.xml"

  tap_text_from_dump "Launch Team" "$OUT_DIR/local-preview-workspace-menu.xml"
  wait_for_text "Launch Team" "local-preview-workspace-launch"
  grep -q 'text="Search"' "$OUT_DIR/local-preview-workspace-launch.xml"
  grep -q 'text="Finalize launch readiness"' "$OUT_DIR/local-preview-workspace-launch.xml"
  if tr '<' '\n' <"$OUT_DIR/local-preview-workspace-launch.xml" | grep -q \
    'text="Launch".*class="android.widget.EditText"'; then
    echo "Switching workspaces should clear the previous workspace search." >&2
    exit 1
  fi

  tap_text_from_dump "Launch Team" "$OUT_DIR/local-preview-workspace-launch.xml"
  sleep 1
  capture_screen "local-preview-workspace-menu-return"
  grep -q 'text="Revenue Team"' "$OUT_DIR/local-preview-workspace-menu-return.xml"

  tap_text_from_dump "Revenue Team" "$OUT_DIR/local-preview-workspace-menu-return.xml"
  wait_for_text "Revenue Team" "local-preview-inbox"
  grep -q 'text="Search"' "$OUT_DIR/local-preview-inbox.xml"
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
  grep -q 'content-desc="Open files and Frames"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'text="Ask anything or call an agent with @"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'content-desc="Dust avatar"' "$OUT_DIR/local-preview-detail.xml"
  grep -q 'content-desc="Add tools and skills"' "$OUT_DIR/local-preview-detail.xml"
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
  local compose_ime_inset_height_px
  local reply_ime_inset_height_px

  generated_at="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  device_size="$("$ADB" shell wm size | tr -d '\r' | awk -F': ' '/Physical size:/ { print $2; exit }')"
  device_density="$(
    "$ADB" shell wm density | tr -d '\r' | awk -F': ' '
      /Override density:/ { density = $2 }
      /Physical density:/ && density == "" { density = $2 }
      END { print density }
    '
  )"
  compose_ime_inset_height_px="$(awk -F= '$1 == "visible_ime_inset_height_px" { print $2 }' "$OUT_DIR/local-preview-compose-ime.txt")"
  reply_ime_inset_height_px="$(awk -F= '$1 == "visible_ime_inset_height_px" { print $2 }' "$OUT_DIR/local-preview-detail-replied-ime.txt")"

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
        <li>Editor focus and IME activation are asserted; full keyboard rendering is an opt-in check.</li>
        <li>Primary search and composer controls are asserted in the lower half of the screen.</li>
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
        <figcaption>Inbox search focused</figcaption>
        <img src="local-preview-inbox-search-focused.png" alt="Bottom-anchored inbox search with input focus">
      </figure>
      <figure>
        <figcaption>Pod conversations</figcaption>
        <img src="local-preview-pod.png" alt="Pod conversation list with bottom-anchored controls">
      </figure>
      <figure>
        <figcaption>Pod tasks</figcaption>
        <img src="local-preview-pod-tasks.png" alt="Pod task list with a bottom-anchored task composer">
      </figure>
      <figure>
        <figcaption>Pod files</figcaption>
        <img src="local-preview-pod-files.png" alt="Pod file browser with folders, files, and Frame pinning">
      </figure>
      <figure>
        <figcaption>Pod settings</figcaption>
        <img src="local-preview-pod-settings-task-suggestions.png" alt="Pod settings with the task suggestion preference enabled">
      </figure>
      <figure>
        <figcaption>Pod members</figcaption>
        <img src="local-preview-pod-members.png" alt="Pod member sheet with user avatars and editor status">
      </figure>
      <figure>
        <figcaption>Pinned Pod Frame</figcaption>
        <img src="local-preview-pod-frame.png" alt="Pinned Pod Frame in the full file viewer">
      </figure>
      <figure>
        <figcaption>Catch Up - action required</figcaption>
        <img src="local-preview-catch-up-action.png" alt="Catch Up card that opens an action-required conversation">
      </figure>
      <figure>
        <figcaption>Catch Up Frame</figcaption>
        <img src="local-preview-catch-up-frame.png" alt="Frame opened directly from Catch Up">
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
        <figcaption>Skill slash suggestions</figcaption>
        <img src="local-preview-compose-skill-slash.png" alt="Skill suggestions above the focused composer">
      </figure>
      <figure>
        <figcaption>Selected skill</figcaption>
        <img src="local-preview-compose-skill-selected.png" alt="Selected skill shown as a removable composer chip">
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
      <figure>
        <figcaption>Inline Frame</figcaption>
        <img src="local-preview-detail-frame.png" alt="Frame opened from a conversation message">
      </figure>
      <figure>
        <figcaption>Files &amp; Frames drawer</figcaption>
        <img src="local-preview-conversation-files.png" alt="Conversation Files and Frames drawer">
      </figure>
      <figure>
        <figcaption>Conversation Files Frame</figcaption>
        <img src="local-preview-conversation-files-frame.png" alt="Frame opened from Conversation Files">
      </figure>
      <figure>
        <figcaption>Image viewer</figcaption>
        <img src="local-preview-image-viewer.png" alt="Image opened from Conversation Files">
      </figure>
      <figure>
        <figcaption>PDF viewer</figcaption>
        <img src="local-preview-pdf-viewer.png" alt="PDF opened from Conversation Files">
      </figure>
      <figure>
        <figcaption>Unsupported file fallback</figcaption>
        <img src="local-preview-binary-viewer.png" alt="Fallback viewer for an unsupported binary file">
      </figure>
      <figure>
        <figcaption>Checklist viewer</figcaption>
        <img src="local-preview-checklist-viewer.png" alt="Text checklist opened from Conversation Files">
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
    echo "- Inbox search focused: $OUT_DIR/local-preview-inbox-search-focused.png"
    echo "- Pod conversations: $OUT_DIR/local-preview-pod.png"
    echo "- Pod tasks: $OUT_DIR/local-preview-pod-tasks.png"
    echo "- Pod files: $OUT_DIR/local-preview-pod-files.png"
    echo "- Pod settings: $OUT_DIR/local-preview-pod-settings-task-suggestions.png"
    echo "- Pod members: $OUT_DIR/local-preview-pod-members.png"
    echo "- Pinned Pod Frame: $OUT_DIR/local-preview-pod-frame.png"
    echo "- Catch Up action required: $OUT_DIR/local-preview-catch-up-action.png"
    echo "- Catch Up Frame: $OUT_DIR/local-preview-catch-up-frame.png"
    echo "- Catch Up unread: $OUT_DIR/local-preview-catch-up-unread.png"
    echo "- Account menu: $OUT_DIR/local-preview-account-menu.png"
    echo "- Workspace switcher: $OUT_DIR/local-preview-workspace-menu.png"
    echo "- Launch Team inbox: $OUT_DIR/local-preview-workspace-launch.png"
    echo "- Workspace return menu: $OUT_DIR/local-preview-workspace-menu-return.png"
    echo "- New conversation: $OUT_DIR/local-preview-compose.png"
    echo "- Skill slash suggestions: $OUT_DIR/local-preview-compose-skill-slash.png"
    echo "- Selected skill: $OUT_DIR/local-preview-compose-skill-selected.png"
    echo "- Agent picker: $OUT_DIR/local-preview-agent-picker.png"
    echo "- Voice input listening: $OUT_DIR/local-preview-voice-listening.png"
    echo "- Voice input paused: $OUT_DIR/local-preview-voice-paused.png"
    echo "- Typed draft: $OUT_DIR/local-preview-compose-filled.png"
    echo "- Conversation detail: $OUT_DIR/local-preview-detail.png"
    echo "- Reply sent: $OUT_DIR/local-preview-detail-replied.png"
    echo "- File viewer: $OUT_DIR/local-preview-file-viewer.png"
    echo "- Inline Frame: $OUT_DIR/local-preview-detail-frame.png"
    echo "- Conversation Files: $OUT_DIR/local-preview-conversation-files.png"
    echo "- Conversation Files Frame: $OUT_DIR/local-preview-conversation-files-frame.png"
    echo "- Image viewer: $OUT_DIR/local-preview-image-viewer.png"
    echo "- PDF viewer: $OUT_DIR/local-preview-pdf-viewer.png"
    echo "- Unsupported file fallback: $OUT_DIR/local-preview-binary-viewer.png"
    echo "- Checklist viewer: $OUT_DIR/local-preview-checklist-viewer.png"
    echo
    echo "Machine-check UI dumps:"
    echo "- Typed draft: $OUT_DIR/local-preview-compose-filled.xml"
    echo "- Workspace menu: $OUT_DIR/local-preview-workspace-menu.xml"
    echo "- Launch Team inbox: $OUT_DIR/local-preview-workspace-launch.xml"
    echo "- Workspace return menu: $OUT_DIR/local-preview-workspace-menu-return.xml"
    echo "- Login: $OUT_DIR/local-preview-login.xml"
    echo "- Inbox: $OUT_DIR/local-preview-inbox.xml"
    echo "- Inbox search focused: $OUT_DIR/local-preview-inbox-search-focused.xml"
    echo "- Pod conversations: $OUT_DIR/local-preview-pod.xml"
    echo "- Pod search focused: $OUT_DIR/local-preview-pod-search-focused.xml"
    echo "- Pod tasks: $OUT_DIR/local-preview-pod-tasks.xml"
    echo "- Pod task keyboard send: $OUT_DIR/local-preview-pod-task-added.xml"
    echo "- Pod files: $OUT_DIR/local-preview-pod-files.xml"
    echo "- Pod folder: $OUT_DIR/local-preview-pod-folder.xml"
    echo "- Pod settings: $OUT_DIR/local-preview-pod-settings-task-suggestions.xml"
    echo "- Pod members: $OUT_DIR/local-preview-pod-members.xml"
    echo "- Pod notifications: $OUT_DIR/local-preview-pod-notifications.xml"
    echo "- Pinned Pod Frame: $OUT_DIR/local-preview-pod-frame.xml"
    echo "- Catch Up action required: $OUT_DIR/local-preview-catch-up-action.xml"
    echo "- Catch Up Frame: $OUT_DIR/local-preview-catch-up-frame.xml"
    echo "- Catch Up unread: $OUT_DIR/local-preview-catch-up-unread.xml"
    echo "- Account menu: $OUT_DIR/local-preview-account-menu.xml"
    echo "- New conversation: $OUT_DIR/local-preview-compose.xml"
    echo "- Skill slash suggestions: $OUT_DIR/local-preview-compose-skill-slash.xml"
    echo "- Filtered skill slash suggestions: $OUT_DIR/local-preview-compose-skill-slash-filtered.xml"
    echo "- Selected skill: $OUT_DIR/local-preview-compose-skill-selected.xml"
    echo "- Agent picker: $OUT_DIR/local-preview-agent-picker.xml"
    echo "- Agent picker search: $OUT_DIR/local-preview-agent-picker-search.xml"
    echo "- Voice input listening: $OUT_DIR/local-preview-voice-listening.xml"
    echo "- Voice input paused: $OUT_DIR/local-preview-voice-paused.xml"
    echo "- Conversation detail: $OUT_DIR/local-preview-detail.xml"
    echo "- Reply draft: $OUT_DIR/local-preview-detail-reply-ime.xml"
    echo "- Reply sent: $OUT_DIR/local-preview-detail-replied.xml"
    echo "- File viewer: $OUT_DIR/local-preview-file-viewer.xml"
    echo "- Inline Frame: $OUT_DIR/local-preview-detail-frame.xml"
    echo "- Conversation Files: $OUT_DIR/local-preview-conversation-files.xml"
    echo "- Conversation Files Frame: $OUT_DIR/local-preview-conversation-files-frame.xml"
    echo "- Image viewer: $OUT_DIR/local-preview-image-viewer.xml"
    echo "- PDF viewer: $OUT_DIR/local-preview-pdf-viewer.xml"
    echo "- Unsupported file fallback: $OUT_DIR/local-preview-binary-viewer.xml"
    echo "- Checklist viewer: $OUT_DIR/local-preview-checklist-viewer.xml"
    echo
    echo "IME diagnostics:"
    echo "- New conversation: $OUT_DIR/local-preview-compose-ime.txt (${compose_ime_inset_height_px}px visible inset)"
    echo "- Reply sent: $OUT_DIR/local-preview-detail-replied-ime.txt (${reply_ime_inset_height_px}px visible inset)"
    echo
    echo "Notes:"
    echo "- The typed draft screenshot is captured before send to show the filled composer without credentials."
    echo "- Pod tabs, tasks, files, settings, search, Catch Up triage, skill slash selection, every attachment renderer, new-conversation setup, and an existing-conversation reply are exercised end to end."
    echo "- The default smoke asserts editor focus and IME activation, not a full keyboard surface. Set REQUIRE_FULL_IME_SURFACE=1 for that visual-device gate."
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
prepare_test_device_ui
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
assert_pods_collapsed_by_default
assert_pod_flow
assert_bottom_search_flow
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
wait_for_keyboard_state "visible" "new conversation"
capture_ui "local-preview-compose"
assert_editor_focused "$OUT_DIR/local-preview-compose.xml"
assert_text_docked_to_available_bottom \
  "Ask anything or call an agent with @" \
  "$OUT_DIR/local-preview-compose.xml"
record_ime_surface_state "local-preview-compose-ime"
assert_compose_tools_visible
assert_agent_picker_flow
assert_agent_mention_flow
assert_capability_selector_focus_flow
assert_knowledge_selector_focus_flow
assert_skill_slash_flow "local-preview-compose"
assert_inactive_composer_stays_inactive
settle_full_screen_compositor
capture_pixels "local-preview-compose"
tap_content_desc_from_dump "Voice input" "$OUT_DIR/local-preview-compose.xml"
wait_for_ui_text "Draft a concise launch update with owners and next steps" "local-preview-voice-listening"
wait_for_keyboard_state "hidden" "voice input"
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
wait_for_keyboard_state "hidden" "compose after voice input"
assert_editor_not_focused "$OUT_DIR/local-preview-compose-after-voice.xml"
grep -q 'text="Draft a concise launch update with owners and next steps"' \
  "$OUT_DIR/local-preview-compose-after-voice.xml"
"$ADB" shell input keyevent KEYCODE_BACK
wait_for_text "Search" "local-preview-inbox"
tap_content_desc_from_dump "New conversation" "$OUT_DIR/local-preview-inbox.xml"
wait_for_text \
  "Draft a concise launch update with owners and next steps" \
  "local-preview-compose-restored-draft"
wait_for_keyboard_state "visible" "restored new conversation draft"
assert_editor_focused "$OUT_DIR/local-preview-compose-restored-draft.xml"
clear_focused_editor
wait_for_text "Ask anything or call an agent with @" "local-preview-compose"
wait_for_keyboard_state "visible" "new conversation for sending"
capture_ui "local-preview-compose"
assert_editor_focused "$OUT_DIR/local-preview-compose.xml"
input_text_slowly "Draft customer brief"
wait_for_ui_text "Draft customer brief" "local-preview-compose-filled"
sleep 1
capture_screen "local-preview-compose-filled"
grep -q 'text="Draft customer brief"' "$OUT_DIR/local-preview-compose-filled.xml"
grep -q 'content-desc="Send"' "$OUT_DIR/local-preview-compose-filled.xml"
tap_content_desc_from_dump "Send" "$OUT_DIR/local-preview-compose-filled.xml"

wait_for_text_containing "Action list:" "local-preview-detail"
wait_for_keyboard_state "hidden" "new conversation detail"
assert_editor_not_focused "$OUT_DIR/local-preview-detail.xml"
assert_text_in_lower_half "Ask anything or call an agent with @" "$OUT_DIR/local-preview-detail.xml"
assert_text_docked_to_available_bottom \
  "Ask anything or call an agent with @" \
  "$OUT_DIR/local-preview-detail.xml"
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
assert_detail_scroll_dismisses_keyboard
tap_text_containing_from_dump "Briefing summary.md" "$OUT_DIR/local-preview-detail.xml"

wait_for_text_containing "Customer briefing summary" "local-preview-file-viewer"
settle_full_screen_compositor
capture_pixels "local-preview-file-viewer"
assert_file_viewer_chrome_compact
"$ADB" shell input keyevent KEYCODE_BACK
wait_for_text_containing "Action list:" "local-preview-detail-returned"
tap_text_containing_from_dump "Account briefing" "$OUT_DIR/local-preview-detail-returned.xml"
wait_for_text "Customer briefing" "local-preview-detail-frame"
grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-detail-frame.xml"
tap_text_containing_from_dump "Reviewer note" "$OUT_DIR/local-preview-detail-frame.xml"
wait_for_keyboard_state "visible" "Frame reviewer note"
capture_ui "local-preview-detail-frame-ime"
assert_editor_focused "$OUT_DIR/local-preview-detail-frame-ime.xml"
input_text_slowly "Review on Friday"
wait_for_ui_text "Review on Friday" "local-preview-detail-frame-note"
"$ADB" shell input keyevent KEYCODE_BACK
wait_for_keyboard_state "hidden" "Frame reviewer note after Back"
wait_for_ui_text "Customer briefing" "local-preview-detail-frame-ime-dismissed"
"$ADB" shell input keyevent KEYCODE_BACK
wait_for_text_containing "Action list:" "local-preview-detail-returned"

open_conversation_resources_from_edge
  wait_for_text "Files & Frames" "local-preview-conversation-files"
  grep -q 'text="Account briefing"' "$OUT_DIR/local-preview-conversation-files.xml"
  grep -q 'text="Account health.png"' "$OUT_DIR/local-preview-conversation-files.xml"
  grep -q 'text="Briefing summary.md"' "$OUT_DIR/local-preview-conversation-files.xml"
  grep -q 'text="Account checklist.txt"' "$OUT_DIR/local-preview-conversation-files.xml"
  grep -q 'text="Customer brief.pdf"' "$OUT_DIR/local-preview-conversation-files.xml"
  grep -q 'text="Research archive.bin"' "$OUT_DIR/local-preview-conversation-files.xml"
  tap_text_containing_from_dump "Account briefing" "$OUT_DIR/local-preview-conversation-files.xml"
  wait_for_text "Customer briefing" "local-preview-conversation-files-frame"
  grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-conversation-files-frame.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_text_containing "Action list:" "local-preview-detail-returned"
  tap_content_desc_from_dump "Open files and Frames" "$OUT_DIR/local-preview-detail-returned.xml"
  wait_for_text "Files & Frames" "local-preview-conversation-files"
  tap_text_containing_from_dump "Account health.png" "$OUT_DIR/local-preview-conversation-files.xml"
  wait_for_content_desc "Image preview for Account health.png" "local-preview-image-viewer"
  grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-image-viewer.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_text_containing "Action list:" "local-preview-detail-returned"
  tap_content_desc_from_dump "Open files and Frames" "$OUT_DIR/local-preview-detail-returned.xml"
  wait_for_text "Files & Frames" "local-preview-conversation-files"
  tap_text_containing_from_dump "Customer brief.pdf" "$OUT_DIR/local-preview-conversation-files.xml"
  wait_for_content_desc "PDF page 1 of 1" "local-preview-pdf-viewer"
  grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-pdf-viewer.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_text_containing "Action list:" "local-preview-detail-returned"
  tap_content_desc_from_dump "Open files and Frames" "$OUT_DIR/local-preview-detail-returned.xml"
  wait_for_text "Files & Frames" "local-preview-conversation-files"
  tap_text_containing_from_dump "Research archive.bin" "$OUT_DIR/local-preview-conversation-files.xml"
  wait_for_text "Preview unavailable" "local-preview-binary-viewer"
  grep -q 'text="Research archive.bin"' "$OUT_DIR/local-preview-binary-viewer.xml"
  grep -q 'content-desc="Back"' "$OUT_DIR/local-preview-binary-viewer.xml"
  "$ADB" shell input keyevent KEYCODE_BACK
  wait_for_text_containing "Action list:" "local-preview-detail-returned"
  tap_content_desc_from_dump "Open files and Frames" "$OUT_DIR/local-preview-detail-returned.xml"
  wait_for_text "Files & Frames" "local-preview-conversation-files"
  tap_text_containing_from_dump "Account checklist.txt" "$OUT_DIR/local-preview-conversation-files.xml"
wait_for_text_containing "Account review checklist" "local-preview-checklist-viewer"
"$ADB" shell input keyevent KEYCODE_BACK
wait_for_text_containing "Action list:" "local-preview-detail-returned"
tap_text_from_dump "Ask anything or call an agent with @" "$OUT_DIR/local-preview-detail-returned.xml"
sleep 1
assert_skill_slash_flow "local-preview-detail-reply"
input_text_slowly "Thanks this helps"
wait_for_text "Thanks this helps" "local-preview-detail-reply-ime"
grep -q 'content-desc="Send"' "$OUT_DIR/local-preview-detail-reply-ime.xml"
assert_text_docked_to_available_bottom \
  "Thanks this helps" \
  "$OUT_DIR/local-preview-detail-reply-ime.xml"
tap_content_desc_from_dump "Send" "$OUT_DIR/local-preview-detail-reply-ime.xml"
wait_for_text_containing \
  "I drafted a concise response with the recommendation" \
  "local-preview-detail-replied-ime"
wait_for_keyboard_state "visible" "detail after reply"
capture_ui "local-preview-detail-replied-ime"
assert_editor_focused "$OUT_DIR/local-preview-detail-replied-ime.xml"
assert_text_docked_to_available_bottom \
  "Ask anything or call an agent with @" \
  "$OUT_DIR/local-preview-detail-replied-ime.xml"
record_ime_surface_state "local-preview-detail-replied-ime"
hide_keyboard_if_visible
capture_ui "local-preview-detail-replied"
capture_pixels "local-preview-detail-replied"
assert_text_docked_to_available_bottom \
  "Ask anything or call an agent with @" \
  "$OUT_DIR/local-preview-detail-replied.xml"
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
