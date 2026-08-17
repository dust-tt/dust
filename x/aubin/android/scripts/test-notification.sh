#!/usr/bin/env bash
set -euo pipefail

ANDROID_SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
ADB="${ADB:-${ANDROID_SDK:+$ANDROID_SDK/platform-tools/adb}}"
PACKAGE="${PACKAGE:-com.dust.mobile}"
KIND="${1:-agent}"

if [[ -z "${ADB:-}" || ! -x "$ADB" ]]; then
  echo "ADB was not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or ADB." >&2
  exit 1
fi

case "$KIND" in
  agent) extras=(--ez agent true) ;;
  user) extras=(--ez agent false) ;;
  mention) extras=(--ez agent false --ez mention true) ;;
  action) extras=(--ez action_required true) ;;
  *)
    echo "Usage: $0 [agent|user|mention|action]" >&2
    exit 1
    ;;
esac

"$ADB" shell pm grant "$PACKAGE" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
broadcast_output="$("$ADB" shell am broadcast \
  -a com.dust.mobile.DEBUG_NOTIFICATION \
  -n "$PACKAGE/com.dust.mobile.android.notifications.DebugNotificationReceiver" \
  "${extras[@]}")"

if [[ "$broadcast_output" != *"result=1"* ]]; then
  echo "The installed build does not expose the debug notification receiver." >&2
  echo "$broadcast_output" >&2
  exit 1
fi

echo "Posted the $KIND notification preview."
