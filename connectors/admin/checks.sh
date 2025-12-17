#!/usr/bin/env bash

# Run type checking, linting, and formatting in parallel with logs under out/.

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/out"

mkdir -p "$OUT_DIR"

COMMANDS=("npx tsgo --noEmit" "npm run lint" "npm run format")
NAMES=("TypeScript (tsgo --noEmit)" "Lint" "Format")
LOGS=("$OUT_DIR/tsc.log" "$OUT_DIR/lint.log" "$OUT_DIR/format.log")
PIDS=()

for i in "${!COMMANDS[@]}"; do
  log_path="${LOGS[$i]}"
  : >"$log_path"
  (
    cd "$ROOT_DIR" || exit 1
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
