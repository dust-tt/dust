#!/bin/sh

rm -rf src/icons/solid
rm -rf src/logo/platforms
rm -rf src/logo/dust

npx @svgr/cli --no-prettier --index-template svgr-icon-template.js --out-dir src/icons/solid/ src/icons/src/
npx @svgr/cli --no-prettier --index-template svgr-platform-template.js --out-dir src/logo/platforms/ src/logo/src/platforms/
npx @svgr/cli --no-prettier --index-template svgr-logo-template.js --out-dir src/logo/dust/ src/logo/src/dust/

# Prettify and lint - prettier 3 is not working with svgr, so we need to run it separately
npx prettier --write src/icons/solid
npx prettier --write src/logo/platforms
npx prettier --write src/logo/dust

npx eslint --fix src/icons/solid
npx eslint --fix src/logo/platforms
npx eslint --fix src/logo/dust