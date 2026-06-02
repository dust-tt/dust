#!/usr/bin/env bash
# Outputs the list of API handler files in front-api/routes that do not have a
# matching file in front/pages/api. Test files (*.test.ts, *.test.tsx) are
# excluded. Paths are printed relative to front-api/, e.g.:
#   routes/w/[wId]/dust_app_secrets/index.ts
#
# Many files under front-api/routes only mount sub-routers (via app.route(...))
# and are not real handlers. We only consider files that register at least one
# HTTP method on a Hono app (named `app` or `*App`), e.g. app.get(...),
# app.post(...), app.delete(...), etc.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONT_API_ROUTES_DIR="$REPO_ROOT/front-api/routes"
FRONT_API_DIR="$REPO_ROOT/front/pages/api"

# Matches an HTTP method registration on a Hono app variable, e.g. `app.get(`
# or `healthzApp.post(`. Avoids false positives like `ctx.get(`, `map.get(`,
# `headers.get(`, or `Promise.all(`.
HANDLER_PATTERN='(^|[^A-Za-z0-9_])(app|[A-Za-z_][A-Za-z0-9_]*App)\.(get|post|put|patch|delete|all)\('

cd "$FRONT_API_ROUTES_DIR"
find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.ts" ! -name "*.test.tsx" \
  | sed 's|^\./||' \
  | sort \
  | while IFS= read -r rel; do
      if grep -qE "$HANDLER_PATTERN" "$rel" && [[ ! -f "$FRONT_API_DIR/$rel" ]]; then
        echo "routes/$rel"
      fi
    done
