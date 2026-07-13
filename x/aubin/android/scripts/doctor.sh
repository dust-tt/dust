#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADB_BIN="${ADB:-}"
AVD_NAME="${AVD:-DustSamsungS23}"
SYSTEM_IMAGE="${SYSTEM_IMAGE:-system-images;android-35;google_apis;arm64-v8a}"
COMPILE_SDK="${COMPILE_SDK:-35}"
BUILD_TOOLS_VERSION="${BUILD_TOOLS_VERSION:-34.0.0}"

fail() {
  echo "doctor: $*" >&2
  exit 1
}

info() {
  echo "doctor: $*"
}

if ! command -v java >/dev/null 2>&1; then
  fail "java was not found on PATH. Install JDK 17 before running Gradle tasks."
fi

if [[ ! -x "$ROOT_DIR/gradlew" ]]; then
  fail "gradlew is missing or not executable at $ROOT_DIR/gradlew."
fi

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK_DIR" ]]; then
  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [[ -d "$candidate" ]]; then
      SDK_DIR="$candidate"
      break
    fi
  done
fi
if [[ -z "$SDK_DIR" ]]; then
  fail "Android SDK not found. Install it in a standard location or set ANDROID_HOME or ANDROID_SDK_ROOT."
fi

if [[ ! -d "$SDK_DIR" ]]; then
  fail "Android SDK directory does not exist: $SDK_DIR"
fi

SDKMANAGER_BIN="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
PLATFORM_JAR="$SDK_DIR/platforms/android-$COMPILE_SDK/android.jar"
BUILD_AAPT2="$SDK_DIR/build-tools/$BUILD_TOOLS_VERSION/aapt2"
if [[ ! -f "$PLATFORM_JAR" || ! -x "$BUILD_AAPT2" ]]; then
  fail "Android SDK is incomplete. Install the build packages with: $SDKMANAGER_BIN --sdk_root=$SDK_DIR 'platforms;android-$COMPILE_SDK' 'build-tools;$BUILD_TOOLS_VERSION' 'platform-tools'"
fi

if [[ -z "$ADB_BIN" ]]; then
  if [[ -x "$SDK_DIR/platform-tools/adb" ]]; then
    ADB_BIN="$SDK_DIR/platform-tools/adb"
  else
    ADB_BIN="$(command -v adb || true)"
  fi
fi

if [[ -z "$ADB_BIN" || ! -x "$ADB_BIN" ]]; then
  fail "adb was not found. Pass ADB=/path/to/platform-tools/adb or install Android platform-tools."
fi

info "java: $(java -version 2>&1 | head -n 1)"
info "sdk: $SDK_DIR"
info "adb: $ADB_BIN"

devices="$("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
if [[ -n "$devices" ]]; then
  info "attached devices:"
  echo "$devices" | sed 's/^/  - /'
else
  EMULATOR_BIN="${EMULATOR:-$SDK_DIR/emulator/emulator}"
  if [[ ! -x "$EMULATOR_BIN" ]]; then
    fail "no attached device is ready and emulator was not found at $EMULATOR_BIN."
  fi
  if ! "$EMULATOR_BIN" -version >/dev/null 2>&1; then
    fail "emulator installation is incomplete at $EMULATOR_BIN. Reinstall it with: $SDKMANAGER_BIN --sdk_root=$SDK_DIR 'emulator'"
  fi

  system_image_dir="$SDK_DIR/${SYSTEM_IMAGE//;/\/}"
  if [[ ! -f "$system_image_dir/system.img" ]]; then
    fail "Samsung system image '$SYSTEM_IMAGE' is missing or incomplete. Install it with: $SDKMANAGER_BIN --sdk_root=$SDK_DIR '$SYSTEM_IMAGE'"
  fi

  info "emulator: $EMULATOR_BIN"
  if "$EMULATOR_BIN" -list-avds | grep -qx "$AVD_NAME"; then
    info "Samsung AVD: $AVD_NAME"
  else
    AVDMANAGER_BIN="$SDK_DIR/cmdline-tools/latest/bin/avdmanager"
    if [[ ! -x "$AVDMANAGER_BIN" ]]; then
      fail "AVD '$AVD_NAME' does not exist and avdmanager was not found at $AVDMANAGER_BIN."
    fi

    info "Samsung AVD '$AVD_NAME' is not created yet; smoke scripts can create it with $AVDMANAGER_BIN."
  fi
fi

info "ok"
