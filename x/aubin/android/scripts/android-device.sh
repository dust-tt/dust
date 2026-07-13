#!/usr/bin/env bash
set -euo pipefail

PACKAGE="${PACKAGE:-com.dust.mobile}"
ACTIVITY="${ACTIVITY:-.android.MainActivity}"
ADB_BIN="${ADB:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/android-device.sh <command> [argument]

Commands:
  devices                  List attached Android devices and authorization state.
  doctor                   Print selected-device and installed-app details.
  install <apk>            Install or update an APK on the selected device.
  install-and-launch <apk> Install an APK and launch Dust.
  launch                   Launch the installed Dust app.
  logs                     Stream logcat for the running Dust process.
  diagnostics              Capture a bounded local diagnostics bundle.
  uninstall                Uninstall Dust from the selected device.

Set ANDROID_SERIAL when more than one device is attached.
USAGE
}

fail() {
  echo "android-device: $*" >&2
  exit 1
}

resolve_adb() {
  if [[ -z "$ADB_BIN" ]]; then
    local sdk_dir="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
    if [[ -z "$sdk_dir" ]]; then
      local candidate
      for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
        if [[ -d "$candidate" ]]; then
          sdk_dir="$candidate"
          break
        fi
      done
    fi
    if [[ -n "$sdk_dir" && -x "$sdk_dir/platform-tools/adb" ]]; then
      ADB_BIN="$sdk_dir/platform-tools/adb"
    else
      ADB_BIN="$(command -v adb || true)"
    fi
  elif [[ "$ADB_BIN" != */* ]]; then
    ADB_BIN="$(command -v "$ADB_BIN" || true)"
  fi

  if [[ -z "$ADB_BIN" || ! -x "$ADB_BIN" ]]; then
    fail "adb was not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or ADB."
  fi
}

list_devices() {
  "$ADB_BIN" devices -l
}

select_device() {
  local requested_serial="${ANDROID_SERIAL:-}"
  local ready_devices
  local ready_count

  if [[ -n "$requested_serial" ]]; then
    local state
    state="$("$ADB_BIN" -s "$requested_serial" get-state 2>/dev/null || true)"
    if [[ "$state" != "device" ]]; then
      list_devices >&2
      fail "ANDROID_SERIAL=$requested_serial is not ready. Unlock the device and accept the USB debugging prompt."
    fi
    DEVICE_SERIAL="$requested_serial"
    return
  fi

  ready_devices="$("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  ready_count="$(awk 'NF { count += 1 } END { print count + 0 }' <<<"$ready_devices")"

  if [[ "$ready_count" == "0" ]]; then
    list_devices >&2
    fail "no authorized Android device is ready. Connect one, unlock it, and enable USB debugging."
  fi

  if [[ "$ready_count" != "1" ]]; then
    list_devices >&2
    fail "multiple devices are ready. Retry with ANDROID_SERIAL=<serial>."
  fi

  DEVICE_SERIAL="$ready_devices"
}

adb_device() {
  "$ADB_BIN" -s "$DEVICE_SERIAL" "$@"
}

device_property() {
  adb_device shell getprop "$1" 2>/dev/null | tr -d '\r'
}

device_label() {
  local manufacturer
  local model
  manufacturer="$(device_property ro.product.manufacturer)"
  model="$(device_property ro.product.model)"
  printf '%s %s' "$manufacturer" "$model" | sed 's/^ *//; s/ *$//'
}

is_package_installed() {
  adb_device shell pm path "$PACKAGE" 2>/dev/null | grep -q '^package:'
}

install_apk() {
  local apk_path="$1"
  local install_output
  local install_status

  if [[ ! -f "$apk_path" ]]; then
    fail "APK does not exist: $apk_path"
  fi

  echo "android-device: installing $(basename "$apk_path") on $DEVICE_SERIAL ($(device_label))"
  set +e
  install_output="$(adb_device install -r "$apk_path" 2>&1)"
  install_status=$?
  set -e
  printf '%s\n' "$install_output"

  if [[ "$install_status" == "0" ]]; then
    return
  fi

  if grep -q 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' <<<"$install_output"; then
    echo "android-device: the installed $PACKAGE uses a different signing certificate." >&2
    echo "android-device: uninstalling clears local app data; run ANDROID_SERIAL=$DEVICE_SERIAL make uninstall, then retry." >&2
  elif grep -q 'INSTALL_FAILED_VERSION_DOWNGRADE' <<<"$install_output"; then
    echo "android-device: the installed app has a newer versionCode. Increment versionCode or uninstall it before retrying." >&2
  elif grep -q 'INSTALL_FAILED_USER_RESTRICTED' <<<"$install_output"; then
    echo "android-device: unlock the phone and approve the USB installation prompt, then retry." >&2
  fi

  exit "$install_status"
}

launch_app() {
  if ! is_package_installed; then
    fail "$PACKAGE is not installed on $DEVICE_SERIAL."
  fi

  adb_device shell am start -n "$PACKAGE/$ACTIVITY" >/dev/null
  echo "android-device: launched $PACKAGE on $DEVICE_SERIAL ($(device_label))"
}

print_doctor() {
  local android_version
  local sdk_level
  local abi
  android_version="$(device_property ro.build.version.release)"
  sdk_level="$(device_property ro.build.version.sdk)"
  abi="$(device_property ro.product.cpu.abi)"

  echo "android-device: serial: $DEVICE_SERIAL"
  echo "android-device: model: $(device_label)"
  echo "android-device: Android: $android_version (API $sdk_level)"
  echo "android-device: ABI: $abi"

  if is_package_installed; then
    local package_details
    package_details="$(adb_device shell dumpsys package "$PACKAGE" 2>/dev/null | tr -d '\r')"
    echo "android-device: $PACKAGE installed"
    sed -n -E 's/^ +((versionCode|versionName|firstInstallTime|lastUpdateTime)=.*)$/android-device: \1/p' <<<"$package_details"
  else
    echo "android-device: $PACKAGE is not installed"
  fi
}

capture_command() {
  local output_path="$1"
  shift
  "$@" >"$output_path" 2>&1 || true
}

capture_diagnostics() {
  local timestamp
  local safe_serial
  local base_dir
  local output_dir
  local archive_path
  local remote_ui
  local pid

  timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  safe_serial="$(printf '%s' "$DEVICE_SERIAL" | tr -c 'A-Za-z0-9._-' '_')"
  base_dir="${DIAGNOSTICS_DIR:-/tmp/dust-android-diagnostics}"
  mkdir -p "$base_dir"
  base_dir="$(cd "$base_dir" && pwd)"
  output_dir="$base_dir/$timestamp-$safe_serial"
  archive_path="$output_dir.tar.gz"
  mkdir -p "$output_dir"

  echo "android-device: diagnostics include the current screenshot/UI text and recent Android logs."
  echo "android-device: capturing $output_dir"

  {
    echo "generated_at=$timestamp"
    echo "serial=$DEVICE_SERIAL"
    echo "model=$(device_label)"
    echo "package=$PACKAGE"
    echo "activity=$ACTIVITY"
    echo "android_version=$(device_property ro.build.version.release)"
    echo "sdk=$(device_property ro.build.version.sdk)"
    echo "build_fingerprint=$(device_property ro.build.fingerprint)"
  } >"$output_dir/summary.txt"

  capture_command "$output_dir/device-properties.txt" adb_device shell getprop
  capture_command "$output_dir/display.txt" adb_device shell wm size
  adb_device shell wm density >>"$output_dir/display.txt" 2>&1 || true
  capture_command "$output_dir/battery.txt" adb_device shell dumpsys battery
  capture_command "$output_dir/storage.txt" adb_device shell df -h /data
  capture_command "$output_dir/package.txt" adb_device shell dumpsys package "$PACKAGE"
  capture_command "$output_dir/activity.txt" adb_device shell dumpsys activity activities
  capture_command "$output_dir/window.txt" adb_device shell dumpsys window windows
  capture_command "$output_dir/memory.txt" adb_device shell dumpsys meminfo "$PACKAGE"
  capture_command "$output_dir/rendering.txt" adb_device shell dumpsys gfxinfo "$PACKAGE"

  pid="$(adb_device shell pidof -s "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
  if [[ -n "$pid" ]]; then
    echo "pid=$pid" >>"$output_dir/summary.txt"
    capture_command "$output_dir/app-logcat.txt" adb_device logcat -d --pid="$pid" -v threadtime -t 2000
  else
    echo "pid=not-running" >>"$output_dir/summary.txt"
    echo "$PACKAGE was not running when diagnostics were captured." >"$output_dir/app-logcat.txt"
  fi
  capture_command "$output_dir/crash-logcat.txt" adb_device logcat -b crash -d -v threadtime -t 500

  if ! adb_device exec-out screencap -p >"$output_dir/screenshot.png"; then
    rm -f "$output_dir/screenshot.png"
  fi

  remote_ui="/sdcard/dust-diagnostics-$$.xml"
  if adb_device shell uiautomator dump "$remote_ui" >/dev/null 2>&1; then
    adb_device pull "$remote_ui" "$output_dir/ui.xml" >/dev/null 2>&1 || true
  fi
  adb_device shell rm -f "$remote_ui" >/dev/null 2>&1 || true

  tar -czf "$archive_path" -C "$base_dir" "$(basename "$output_dir")"
  echo "android-device: diagnostics: $output_dir"
  echo "android-device: archive: $archive_path"
}

resolve_adb
command_name="${1:-}"

case "$command_name" in
  devices)
    list_devices
    ;;
  doctor | launch | logs | diagnostics | uninstall)
    select_device
    case "$command_name" in
      doctor) print_doctor ;;
      launch) launch_app ;;
      logs)
        pid="$(adb_device shell pidof -s "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
        if [[ -z "$pid" ]]; then
          fail "no running process for $PACKAGE. Launch the app first."
        fi
        echo "android-device: streaming logs for $PACKAGE (pid $pid) on $DEVICE_SERIAL"
        exec "$ADB_BIN" -s "$DEVICE_SERIAL" logcat --pid="$pid" -v color
        ;;
      diagnostics) capture_diagnostics ;;
      uninstall)
        if is_package_installed; then
          adb_device uninstall "$PACKAGE"
        else
          echo "android-device: $PACKAGE is not installed on $DEVICE_SERIAL"
        fi
        ;;
    esac
    ;;
  install | install-and-launch)
    if [[ -z "${2:-}" ]]; then
      usage >&2
      exit 2
    fi
    select_device
    install_apk "$2"
    if [[ "$command_name" == "install-and-launch" ]]; then
      launch_app
    fi
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
