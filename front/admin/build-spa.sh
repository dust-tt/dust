#!/bin/bash
# Build the Vite SPA from front-spa workspace and copy to Next.js public folder

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$FRONT_DIR")"
FRONT_SPA_DIR="$ROOT_DIR/front-spa"

rm -rf "$FRONT_DIR/public/spa"

echo "Building poke SPA from front-spa workspace..."
cd "$FRONT_SPA_DIR"
VITE_BASE_PATH=/spa VITE_DUST_CLIENT_FACING_URL="$DUST_CLIENT_FACING_URL" npm run build:poke

echo "Copying build to front/public/spa..."
cp -r "$FRONT_SPA_DIR/dist/poke" "$FRONT_DIR/public/spa"

echo "Done! SPA available at /spa/"
