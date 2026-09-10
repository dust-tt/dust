#!/bin/bash

# MOMENT-BAN: delete this file, and its lefthook/dangerfile hooks and CONTRACTS
# entry (grep the repo for "MOMENT-BAN"), once no file imports `moment` anymore.
#
# Blocks new usage of `moment` (staged) in files that didn't already import it
# at HEAD. See https://github.com/dust-tt/decisions/issues/1009: `moment` is
# being phased out in favor of `date-fns` (front/lib/utils/timestamps.ts);
# existing usage is migrated opportunistically, not blocked.
# Usage: ./check-no-new-moment-usage.sh <file>...

set -euo pipefail

moment_import_pattern=$'((import|from)[[:space:]]+["\x27]moment(-timezone)?(/[^"\x27]*)?["\x27]|require\\(["\x27]moment(-timezone)?(/[^"\x27]*)?["\x27]\\))'

violations=()

for f in "$@"; do
  case "$f" in
    *.ts|*.tsx|*.js|*.jsx) ;;
    *) continue ;;
  esac

  staged_content=$(git show ":$f" 2>/dev/null || true)
  if [ -z "$staged_content" ] || ! echo "$staged_content" | grep -qE "$moment_import_pattern"; then
    continue
  fi

  if git cat-file -e "HEAD:$f" 2>/dev/null; then
    head_content=$(git show "HEAD:$f")
    if echo "$head_content" | grep -qE "$moment_import_pattern"; then
      continue
    fi
  fi

  violations+=("$f")
done

if [ ${#violations[@]} -gt 0 ]; then
  echo "Error: new usage of 'moment' introduced in:"
  for f in "${violations[@]}"; do
    echo "  - $f"
  done
  echo ""
  echo "moment is being phased out in favor of date-fns (see front/lib/utils/timestamps.ts"
  echo "and https://github.com/dust-tt/decisions/issues/1009). Use date-fns instead."
  echo "Skip with LEFTHOOK_EXCLUDE=no-new-moment-usage if this is a false positive."
  exit 1
fi

exit 0
