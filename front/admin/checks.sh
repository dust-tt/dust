#!/usr/bin/env bash

# Run front type checking and Biome checks in parallel with logs under out/.

set -u

FRONT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$FRONT_DIR/.." && pwd)"
OUT_DIR="$FRONT_DIR/out"

mkdir -p "$OUT_DIR"

COMMANDS=("npx tsgo --noEmit" "npx biome check --error-on-warnings front")
DIRS=("$FRONT_DIR" "$REPO_ROOT")
NAMES=("TypeScript (tsgo --noEmit)" "Biome check")
LOGS=("$OUT_DIR/tsgo.log" "$OUT_DIR/biome.log")
PIDS=()

for i in "${!COMMANDS[@]}"; do
  log_path="${LOGS[$i]}"
  : >"$log_path"
  (
    cd "${DIRS[$i]}" || exit 1
    ${COMMANDS[$i]}
  ) >"$log_path" 2>&1 &
  PIDS[$i]=$!
done

GREEN="\033[32m"
RED="\033[31m"
RESET="\033[0m"

status=0

for i in "${!PIDS[@]}"; do
  pid="${PIDS[$i]}"
  name="${NAMES[$i]}"
  log_path="${LOGS[$i]}"

  if wait "$pid"; then
    printf "%b\n" "${GREEN}[OK]${RESET} ${name}"
  else
    status=1
    printf "%b\n" "${RED}[FAIL]${RESET} ${name}"
    while IFS= read -r line; do
      printf "%b\n" "${RED}${line}${RESET}"
    done <"$log_path"
  fi
done

exit "$status"
