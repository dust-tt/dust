#!/usr/bin/env bash
# Shows what stat and du report for files of known sizes.
#
# Linux counts the space a file takes in fixed 512 byte units and du multiplies
# the count it reads by 512. Reporting that count in any other unit makes du show
# the wrong size, which is easy to do because the preferred size for reads and
# writes is 4096 and sits right next to it.
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

harness_start
WORK="$MOUNTPOINT/conversation/space-probe"
mkdir -p "$WORK"

printf "%-10s %-10s %-12s %-10s %s\n" "size" "blocks" "blocks*512" "du (1K)" "verdict"
for size in 0 1 100 512 4096 5000 1048576; do
  path="$WORK/file-$size"
  head -c "$size" /dev/zero >"$path" 2>/dev/null || : >"$path"
  blocks="$(stat -c %b "$path")"
  allocated=$((blocks * 512))
  verdict=ok
  if [[ "$size" -gt 0 && "$allocated" -lt "$size" ]]; then
    verdict="reports less space than the file holds"
  fi
  printf "%-10s %-10s %-12s %-10s %s\n" \
    "$size" "$blocks" "$allocated" "$(du "$path" | cut -f1)" "$verdict"
  if [[ "$verdict" == ok ]]; then
    harness_check "a file of $size bytes reports enough space" 0
  else
    harness_check "a file of $size bytes reports enough space" 1
  fi
done

echo
echo "the unit stat uses for the block count: $(stat -c %B "$WORK/file-4096")"
echo "the preferred size for reads and writes: $(stat -c %o "$WORK/file-4096")"
echo "du of the directory:                     $(du -s "$WORK" | cut -f1) (1K blocks)"
echo "the same counting bytes in the files:    $(du -s --apparent-size "$WORK" | cut -f1)"

harness_report
