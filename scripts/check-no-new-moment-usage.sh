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

moment_import_pattern=$'((import|from)[[:space:]]+["\x27]moment(-timezone)?(/[^"\x27]*)?["\x27]|(require|import)\\(["\x27]moment(-timezone)?(/[^"\x27]*)?["\x27]\\))'

has_moment_import() {
  # Collapse newlines (via `tr`, not bash's ${//} substitution, which is
  # O(n^2) and hangs on large files) so a multi-line `from\n"moment"` still
  # matches. Written to a temp file rather than piped into `grep -q`: with
  # `pipefail`, grep's early exit on match can SIGPIPE the writing process,
  # making the pipeline look like a failed match even though it matched.
  local tmpfile
  tmpfile=$(mktemp)
  tr '\n' ' ' <<<"$1" >"$tmpfile"
  local matched=0
  grep -qE "$moment_import_pattern" "$tmpfile" || matched=1
  rm -f "$tmpfile"
  return "$matched"
}

violations=()

for f in "$@"; do
  case "$f" in
    *.ts|*.tsx|*.js|*.jsx) ;;
    *) continue ;;
  esac

  staged_content=$(git show ":$f" 2>/dev/null || true)
  if [ -z "$staged_content" ] || ! has_moment_import "$staged_content"; then
    continue
  fi

  if git cat-file -e "HEAD:$f" 2>/dev/null; then
    head_content=$(git show "HEAD:$f")
    if has_moment_import "$head_content"; then
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
