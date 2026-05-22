#!/usr/bin/env bash
# Outputs the list of API handler files in front/pages/api that do not have a
# matching file in front-api/routes. Test files (*.test.ts, *.test.tsx) are
# excluded. Paths are printed relative to front/, e.g.:
#   pages/api/w/[wId]/dust_app_secrets/index.ts

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONT_API_DIR="$REPO_ROOT/front/pages/api"
FRONT_API_ROUTES_DIR="$REPO_ROOT/front-api/routes"

cd "$FRONT_API_DIR"
find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.ts" ! -name "*.test.tsx" \
  ! -path "./marketing/*" \
  | sed 's|^\./||' \
  | sort \
  | while IFS= read -r rel; do
      if [[ ! -f "$FRONT_API_ROUTES_DIR/$rel" ]]; then
        echo "pages/api/$rel"
      fi
    done
