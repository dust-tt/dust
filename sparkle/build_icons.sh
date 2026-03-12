#!/bin/sh

rm -rf src/icons/app
rm -rf src/icons/actions
rm -rf src/logo/platforms
rm -rf src/logo/dust

npx @svgr/cli --no-prettier --index-template svgr-icon-template.js --out-dir src/icons/app/ src/icons/src/app
npx @svgr/cli --no-prettier --index-template svgr-actions-icon-template.js --out-dir src/icons/actions/ src/icons/src/actions
npx @svgr/cli --no-prettier --index-template svgr-platform-template.js --out-dir src/logo/platforms/ src/logo/src/platforms/
npx @svgr/cli --no-prettier --index-template svgr-logo-template.js --out-dir src/logo/dust/ src/logo/src/dust/

# Format and lint generated files with Biome
npx biome check --write .