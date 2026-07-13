#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRADLE_BIN="${GRADLE:-$ROOT_DIR/gradlew}"
BUILD_TOOLS_VERSION="${BUILD_TOOLS_VERSION:-34.0.0}"
SOURCE_APK="$ROOT_DIR/app/build/outputs/apk/phoneRelease/app-phoneRelease.apk"
DIST_DIR="$ROOT_DIR/dist"
DIST_APK="$DIST_DIR/dust-mobile-phone-release.apk"
CHECKSUM_FILE="$DIST_APK.sha256"
ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"

if [[ -z "$ANDROID_SDK" ]]; then
  for candidate in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [[ -d "$candidate" ]]; then
      ANDROID_SDK="$candidate"
      break
    fi
  done
fi

fail() {
  echo "phone-release: $*" >&2
  exit 1
}

if [[ ! -x "$GRADLE_BIN" ]]; then
  fail "Gradle wrapper was not found at $GRADLE_BIN."
fi

if [[ -z "$ANDROID_SDK" ]]; then
  fail "ANDROID_HOME or ANDROID_SDK_ROOT must point to an Android SDK."
fi

APKSIGNER_BIN="${APKSIGNER:-$ANDROID_SDK/build-tools/$BUILD_TOOLS_VERSION/apksigner}"
if [[ ! -x "$APKSIGNER_BIN" ]]; then
  fail "apksigner was not found at $APKSIGNER_BIN. Run make doctor or set APKSIGNER explicitly."
fi

echo "phone-release: building production-configured phoneRelease APK"
"$GRADLE_BIN" :app:assemblePhoneRelease

if [[ ! -f "$SOURCE_APK" ]]; then
  fail "Gradle completed without producing $SOURCE_APK."
fi

verification="$("$APKSIGNER_BIN" verify --verbose --print-certs "$SOURCE_APK")"
certificate_digest="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' <<<"$verification" | head -n 1)"
if [[ -z "$certificate_digest" ]]; then
  fail "apksigner verified the APK but did not report a certificate SHA-256 digest."
fi

mkdir -p "$DIST_DIR"
cp -f "$SOURCE_APK" "$DIST_APK"
(
  cd "$DIST_DIR"
  shasum -a 256 "$(basename "$DIST_APK")" >"$(basename "$CHECKSUM_FILE")"
)

apk_digest="$(awk '{ print $1 }' "$CHECKSUM_FILE")"
echo "phone-release: signature verified"
echo "phone-release: certificate SHA-256: $certificate_digest"
echo "phone-release: APK SHA-256: $apk_digest"
echo "phone-release: artifact: $DIST_APK"
