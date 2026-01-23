#!/bin/bash
# Build the Vite SPA and copy to Next.js public folder

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Building SPA..."
cd "$FRONT_DIR"
VITE_BASE_PATH=/spa VITE_DUST_CLIENT_FACING_URL="$DUST_CLIENT_FACING_URL" npx vite build --config vite.spa.config.ts

echo "Copying build to public/spa..."
rm -rf "$FRONT_DIR/public/spa"
cp -r "$FRONT_DIR/app/dist" "$FRONT_DIR/public/spa"

echo "Done! SPA available at /spa/"
