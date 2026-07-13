#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../../.." && pwd)"
SOURCE_LOGO="$REPO_ROOT/front/public/static/landing/logos/dust/Dust_Logo.svg"
SOURCE_SQUARE="$REPO_ROOT/front/public/static/landing/logos/dust/Dust_LogoSquare.svg"
MANIFEST="$ROOT_DIR/app/src/main/AndroidManifest.xml"
SPLASH_STYLE="$ROOT_DIR/app/src/main/res/values-v31/styles.xml"

if [[ ! -f "$SOURCE_LOGO" || ! -f "$SOURCE_SQUARE" ]]; then
  echo "Dust source logo SVGs were not found under front/public/static/landing/logos/dust." >&2
  exit 1
fi

source_colors="$(
  grep -Eho 'fill="#[A-Fa-f0-9]{6}"' "$SOURCE_LOGO" "$SOURCE_SQUARE" |
    sed -E 's/fill="(#[A-Fa-f0-9]{6})"/\1/' |
    sort -u
)"
source_orange="$(
  grep -Eo 'fill="#[A-Fa-f0-9]{6}"' "$SOURCE_LOGO" |
    sed -E 's/fill="(#[A-Fa-f0-9]{6})"/\1/' |
    head -n 1
)"

logo_targets=(
  "$ROOT_DIR/app/src/main/res/drawable/dust_logo.xml"
  "$ROOT_DIR/app/src/main/res/drawable/dust_logo_square.xml"
  "$ROOT_DIR/app/src/main/res/drawable/ic_launcher.xml"
  "$ROOT_DIR/app/src/main/res/drawable/ic_launcher_foreground.xml"
  "$ROOT_DIR/app/src/main/res/mipmap-anydpi/ic_launcher.xml"
  "$ROOT_DIR/app/src/main/res/mipmap-anydpi/ic_launcher_round.xml"
)

adaptive_icon_targets=(
  "$ROOT_DIR/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"
  "$ROOT_DIR/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml"
)

for target in "${logo_targets[@]}"; do
  if [[ ! -f "$target" ]]; then
    echo "Missing Android logo resource: $target" >&2
    exit 1
  fi

  if ! grep -q "android:fillColor=\"$source_orange\"" "$target"; then
    echo "Android logo resource does not use source Dust orange $source_orange: $target" >&2
    exit 1
  fi
done

android_colors="$(
  grep -Eho 'android:fillColor="#[A-Fa-f0-9]{6}"' "${logo_targets[@]}" |
    sed -E 's/android:fillColor="(#[A-Fa-f0-9]{6})"/\1/' |
    sort -u
)"

while IFS= read -r color; do
  if [[ -n "$color" ]] && ! grep -qx "$color" <<<"$source_colors"; then
    echo "Android logo color is not present in the source Dust SVGs: $color" >&2
    exit 1
  fi
done <<<"$android_colors"

if ! grep -q 'android:icon="@mipmap/ic_launcher"' "$MANIFEST"; then
  echo "Android manifest does not use the Dust launcher icon." >&2
  exit 1
fi

if ! grep -q 'android:roundIcon="@mipmap/ic_launcher_round"' "$MANIFEST"; then
  echo "Android manifest does not use the Dust round launcher icon." >&2
  exit 1
fi

for target in "${adaptive_icon_targets[@]}"; do
  if [[ ! -f "$target" ]]; then
    echo "Missing Android adaptive launcher resource: $target" >&2
    exit 1
  fi

  if ! grep -q 'background android:drawable="@color/dust_background"' "$target"; then
    echo "Android adaptive launcher icon does not use the Dust background: $target" >&2
    exit 1
  fi

  if ! grep -q 'foreground android:drawable="@drawable/ic_launcher_foreground"' "$target"; then
    echo "Android adaptive launcher icon does not use the Dust foreground: $target" >&2
    exit 1
  fi
done

if ! grep -q 'android:windowSplashScreenAnimatedIcon">@drawable/dust_logo_square<' "$SPLASH_STYLE"; then
  echo "Android 12 splash screen does not use the Dust square logo." >&2
  exit 1
fi

if ! grep -q 'android:windowSplashScreenBackground">@color/dust_background<' "$SPLASH_STYLE"; then
  echo "Android 12 splash screen does not use the Dust background." >&2
  exit 1
fi

if grep -R -n '#FFAA0D' "$ROOT_DIR/app/src/main/res" >/tmp/dust-android-stale-brand-color.log; then
  echo "Stale Dust orange #FFAA0D found in Android resources:" >&2
  cat /tmp/dust-android-stale-brand-color.log >&2
  exit 1
fi

echo "Dust Android brand assets match the source SVG colors and launcher/splash references."
