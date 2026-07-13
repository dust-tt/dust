#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${OUT_DIR:-/tmp/dust-android-samsung-smoke}"
LOCAL_PREVIEW_DIR="$OUT_DIR/local-preview-flow"

print_entry() {
  local label="$1"
  local path="$2"

  if [[ -f "$path" ]]; then
    echo "- $label: $path"
  else
    echo "- $label: missing ($path)"
  fi
}

print_index_line() {
  local prefix="$1"
  local path="$2"

  if [[ -f "$path" ]]; then
    local value
    value="$(grep -E "^$prefix" "$path" | head -n 1 || true)"
    if [[ -n "$value" ]]; then
      echo "- $value"
    fi
  fi
}

echo "Dust Android presentation"
echo
echo "Visible app:"
echo "- Open prodDebug sample workspace inbox: make show-app"
echo "- Refresh Samsung sample workspace pack: make present-samsung-local-preview"
echo "- Refresh full no-credential pack: make presentation-refresh"
echo
echo "Review entry points:"
print_entry "Presentation index" "$OUT_DIR/presentation-index.html"
print_entry "Prod login review" "$OUT_DIR/prod-review.html"
print_entry "Sample workspace review" "$LOCAL_PREVIEW_DIR/local-preview-review.html"
print_entry "Authenticated WorkOS review" "$OUT_DIR/authenticated-review.html"
if [[ -f "$LOCAL_PREVIEW_DIR/local-preview-workspace-menu.png" ]]; then
  echo "- Sample workspace review includes workspace switching screenshots."
fi
echo
echo "Current artifact status:"
workos_status=""
if [[ -f "$OUT_DIR/presentation-index.txt" ]]; then
  print_index_line "Generated:" "$OUT_DIR/presentation-index.txt"
  print_index_line "Real WorkOS E2E:" "$OUT_DIR/presentation-index.txt"
  workos_status="$(grep -E '^Real WorkOS E2E:' "$OUT_DIR/presentation-index.txt" | head -n 1 || true)"
else
  echo "- Missing $OUT_DIR/presentation-index.txt"
fi
if [[ -f "$OUT_DIR/authenticated-preflight.png" ]]; then
  echo "- Prod sign-in preflight: $OUT_DIR/authenticated-preflight.png"
fi
if [[ -f "$OUT_DIR/authenticated-timeout.png" || -f "$OUT_DIR/authenticated-timeout.xml" ]]; then
  echo
  echo "Last WorkOS timeout context:"
  print_entry "Timeout screenshot" "$OUT_DIR/authenticated-timeout.png"
  print_entry "Timeout UI dump" "$OUT_DIR/authenticated-timeout.xml"
fi
if [[ "$workos_status" == "Real WorkOS E2E: not captured" ]]; then
  echo
  echo "Next WorkOS step:"
  echo "- make presentation-capture-workos"
  echo "- Override timeout with PRESENTATION_AUTH_TIMEOUT_SECONDS=<seconds>."
  echo "- Use make presentation-check-workos for the full gate plus manual sign-in."
fi
echo
echo "Useful commands:"
echo "- make presentation-summary"
echo "- make presentation-refresh"
echo "- make presentation-check"
echo "- make presentation-capture-workos"
echo "- make presentation-check-workos"
