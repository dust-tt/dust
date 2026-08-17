#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UI_ROOT="$ROOT/app/src/main/kotlin/com/dust/mobile/android/ui"
TEST_UI_ROOT="$ROOT/app/src/test/kotlin/com/dust/mobile/android/ui"
CORE_ROOT="$ROOT/core/src"
CORE_MAIN_ROOT="$ROOT/core/src/main/kotlin"
APP_MAIN_ROOT="$ROOT/app/src/main/kotlin"
DEBUG_ROOT="$ROOT/app/src/debug/kotlin"
errors=0

fail() {
  printf 'architecture: %s\n' "$1" >&2
  errors=$((errors + 1))
}

package_group() {
  case "$1" in
    com.dust.mobile.android.ui) printf 'root' ;;
    com.dust.mobile.android.ui.auth*) printf 'auth' ;;
    com.dust.mobile.android.ui.common*) printf 'common' ;;
    com.dust.mobile.android.ui.composer*) printf 'composer' ;;
    com.dust.mobile.android.ui.conversation.detail*) printf 'detail' ;;
    com.dust.mobile.android.ui.conversation.files*) printf 'files' ;;
    com.dust.mobile.android.ui.frame*) printf 'frame' ;;
    com.dust.mobile.android.ui.inbox*) printf 'inbox' ;;
    com.dust.mobile.android.ui.message*) printf 'message' ;;
    com.dust.mobile.android.ui.navigation*) printf 'navigation' ;;
    com.dust.mobile.android.ui.preview*) printf 'preview' ;;
    com.dust.mobile.android.ui.theme*) printf 'theme' ;;
    *) printf 'unknown' ;;
  esac
}

allowed_dependencies() {
  case "$1" in
    root) printf 'auth common frame navigation theme' ;;
    auth) printf 'common preview theme' ;;
    common) printf 'theme' ;;
    composer) printf 'common preview theme' ;;
    detail) printf 'common composer message preview theme' ;;
    files) printf 'common frame message preview theme' ;;
    frame) printf 'common theme' ;;
    inbox) printf 'common frame message preview theme' ;;
    message) printf 'common theme' ;;
    navigation) printf 'common composer detail files inbox theme' ;;
    preview|theme) printf '' ;;
    *) printf '' ;;
  esac
}

while IFS= read -r file; do
  relative="${file#"$UI_ROOT"/}"
  directory="$(dirname "$relative")"
  expected_package="com.dust.mobile.android.ui"
  if [ "$directory" != "." ]; then
    expected_package="$expected_package.${directory//\//.}"
  fi
  actual_package="$(sed -n 's/^package //p' "$file" | head -1)"
  if [ "$actual_package" != "$expected_package" ]; then
    fail "$relative declares $actual_package, expected $expected_package"
  fi

  basename="$(basename "$file")"
  if [ "$directory" = "." ] && [ "$basename" != "DustApp.kt" ]; then
    fail "$relative is a feature file in the app-shell package"
  fi
  case "$basename" in
    AppViewModels.kt|UiConstants.kt|*Support.kt|*Utils.kt|*Helpers.kt)
      fail "$relative uses a catch-all filename"
      ;;
  esac

  line_count="$(wc -l < "$file" | tr -d ' ')"
  max_lines=300
  case "$basename" in
    *Controller.kt|*ViewModel.kt) max_lines=350 ;;
  esac
  if [ "$line_count" -gt "$max_lines" ]; then
    fail "$relative has $line_count lines, maximum is $max_lines"
  fi

  view_model_count="$(grep -Ec '^(internal |public )?class [A-Za-z0-9_]+ViewModel\(' "$file" || true)"
  if [ "$view_model_count" -gt 1 ]; then
    fail "$relative declares more than one ViewModel"
  fi
  if [ "$view_model_count" -eq 1 ] && [[ "$basename" != *ViewModel.kt ]]; then
    fail "$relative declares a ViewModel outside a *ViewModel.kt file"
  fi

  if grep -Eq '^import com\.dust\.mobile\.android\.ui\..*\.\*$' "$file"; then
    fail "$relative uses a wildcard UI import"
  fi

  source_group="$(package_group "$actual_package")"
  while IFS= read -r imported; do
    [ -z "$imported" ] && continue
    target_group="$(package_group "$imported")"
    [ "$source_group" = "$target_group" ] && continue
    allowed=" $(allowed_dependencies "$source_group") "
    if [[ "$allowed" != *" $target_group "* ]]; then
      fail "$relative imports forbidden UI layer $target_group via $imported"
    fi
  done < <(sed -n 's/^import \(com\.dust\.mobile\.android\.ui[^ ]*\)\.[^.]*$/\1/p' "$file")
done < <(find "$UI_ROOT" -type f -name '*.kt' | sort)

while IFS= read -r file; do
  line_count="$(wc -l < "$file" | tr -d ' ')"
  if [ "$line_count" -gt 350 ]; then
    fail "${file#"$ROOT"/} has $line_count lines, maximum is 350"
  fi
done < <(find "$CORE_MAIN_ROOT" -type f -name '*.kt' | sort)

while IFS= read -r file; do
  case "$file" in
    "$UI_ROOT"/*) continue ;;
  esac
  line_count="$(wc -l < "$file" | tr -d ' ')"
  if [ "$line_count" -gt 350 ]; then
    fail "${file#"$ROOT"/} has $line_count lines, maximum is 350"
  fi
done < <(find "$APP_MAIN_ROOT" -type f -name '*.kt' | sort)

while IFS= read -r file; do
  line_count="$(wc -l < "$file" | tr -d ' ')"
  if [ "$line_count" -gt 300 ]; then
    fail "${file#"$ROOT"/} has $line_count lines, maximum is 300"
  fi
  if grep -Eq '(^|[^A-Za-z0-9_])(Button|OutlinedButton|TextButton|IconButton|OutlinedTextField)\(' "$file"; then
    fail "${file#"$ROOT"/} bypasses shared action or field primitives"
  fi
  if grep -Eq 'MaterialTheme\.colorScheme\.(primary|onPrimary|primaryContainer|onPrimaryContainer|secondary|onSecondary|secondaryContainer|onSecondaryContainer|surfaceVariant|outlineVariant)' "$file"; then
    fail "${file#"$ROOT"/} bypasses semantic color roles"
  fi
  if grep -Eq 'RoundedCornerShape\((10|12|15)\.dp\)|Color\(0x' "$file"; then
    fail "${file#"$ROOT"/} defines one-off presentation styling"
  fi
done < <(find "$DEBUG_ROOT" -type f -name '*.kt' | sort)

if grep -R -q 'dust_logo_square' "$DEBUG_ROOT" --include='*.kt'; then
  fail "debug presentation uses square brand art as generic content"
fi

while IFS= read -r file; do
  relative="${file#"$UI_ROOT"/}"
  case "$relative" in
    common/Actions.kt|composer/VoiceControls.kt) continue ;;
  esac
  if grep -Eq '(^|[^A-Za-z0-9_])(Button|OutlinedButton|TextButton|IconButton)\(' "$file"; then
    fail "$relative uses a Material action outside the shared action or voice-control primitives"
  fi
done < <(find "$UI_ROOT" -type f -name '*.kt' | sort)

while IFS= read -r file; do
  relative="${file#"$UI_ROOT"/}"
  if grep -q 'OutlinedTextField(' "$file"; then
    fail "$relative uses a one-off outlined text field instead of a shared field pattern"
  fi
  if grep -Eq 'MaterialTheme\.colorScheme\.(primary|onPrimary|primaryContainer|onPrimaryContainer|secondary|onSecondary|secondaryContainer|onSecondaryContainer|surfaceVariant|outlineVariant)' "$file"; then
    fail "$relative bypasses semantic color roles"
  fi
done < <(find "$UI_ROOT" -type f -name '*.kt' | sort)

if grep -R -E '(ToolbarIconButton|CompactIconActionButton|ConversationSectionHeader|PickerSearchField|ComposerToolbarButton|SelectableTag)' "$UI_ROOT" --include='*.kt' >/dev/null; then
  fail "UI code reintroduces a superseded one-off component"
fi

while IFS= read -r file; do
  relative="${file#"$UI_ROOT"/}"
  [ "$relative" = "theme/Theme.kt" ] && continue
  if grep -Eq 'RoundedCornerShape\((10|12|15)\.dp\)' "$file"; then
    fail "$relative uses a non-contract control radius"
  fi
done < <(find "$UI_ROOT" -type f -name '*.kt' | sort)

while IFS= read -r file; do
  relative="${file#"$UI_ROOT"/}"
  case "$relative" in
    theme/Theme.kt|message/MessageContent.kt|common/ConversationSkeletons.kt|common/FeatureSkeletons.kt) continue ;;
  esac
  if grep -q 'RoundedCornerShape(16.dp)' "$file"; then
    fail "$relative uses the message-bubble radius outside a permitted surface"
  fi
done < <(find "$UI_ROOT" -type f -name '*.kt' | sort)

while IFS= read -r file; do
  relative="${file#"$UI_ROOT"/}"
  case "$relative" in
    common/Avatar.kt|common/ConversationSkeletons.kt|composer/VoiceControls.kt|inbox/CatchUpConversationCard.kt|inbox/ConversationAccountMenu.kt|inbox/ConversationRow.kt|message/ActivityTimeline.kt) continue ;;
  esac
  if grep -q 'CircleShape' "$file"; then
    fail "$relative uses a circle outside identity, status, loading, or recording UI"
  fi
done < <(find "$UI_ROOT" -type f -name '*.kt' | sort)

if grep -R -q 'dust_logo_square' "$UI_ROOT" --include='*.kt'; then
  fail "square brand art must not be used as a decorative avatar or feedback icon"
fi

while IFS= read -r file; do
  relative="${file#"$TEST_UI_ROOT"/}"
  directory="$(dirname "$relative")"
  expected_package="com.dust.mobile.android.ui"
  if [ "$directory" != "." ]; then
    expected_package="$expected_package.${directory//\//.}"
  fi
  actual_package="$(sed -n 's/^package //p' "$file" | head -1)"
  if [ "$actual_package" != "$expected_package" ]; then
    fail "test $relative declares $actual_package, expected $expected_package"
  fi
done < <(find "$TEST_UI_ROOT" -type f -name '*.kt' | sort)

while IFS= read -r file; do
  case "$file" in
    "$UI_ROOT/theme/Theme.kt"|"$UI_ROOT/common/Avatar.kt") continue ;;
  esac
  if grep -q 'Color(0x' "$file"; then
    fail "${file#"$ROOT"/} defines a raw color outside the theme or avatar palette"
  fi
done < <(find "$UI_ROOT" -type f -name '*.kt' | sort)

if grep -R -E '^import (android|androidx)\.' "$CORE_ROOT" --include='*.kt' >/dev/null; then
  fail "core imports Android APIs; core must remain platform independent"
fi

if grep -q 'DustAvatar' "$UI_ROOT/inbox/ConversationRow.kt"; then
  fail "conversation rows must not render decorative avatars"
fi

if [ "$errors" -ne 0 ]; then
  printf 'architecture: %d check(s) failed\n' "$errors" >&2
  exit 1
fi

printf 'Architecture checks passed.\n'
