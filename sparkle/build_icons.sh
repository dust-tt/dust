#!/bin/sh

rm -rf src/icons/app
rm -rf src/icons/actions
rm -rf src/logo/platforms
rm -rf src/logo/dust

npx @svgr/cli --no-prettier --index-template svgr-icon-template.js --out-dir src/icons/app/ src/icons/src/app
npx @svgr/cli --no-prettier --index-template svgr-actions-icon-template.js --out-dir src/icons/actions/ src/icons/src/actions
npx @svgr/cli --no-prettier --index-template svgr-platform-template.js --out-dir src/logo/platforms/ src/logo/src/platforms/
npx @svgr/cli --no-prettier --index-template svgr-logo-template.js --out-dir src/logo/dust/ src/logo/src/dust/

# Prettify and lint - prettier 3 is not working with svgr, so we need to run it separately
npx prettier --write src/icons/app
npx prettier --write src/icons/actions
npx prettier --write src/logo/platforms
npx prettier --write src/logo/dust

npx eslint --fix src/icons/app
npx eslint --fix src/icons/actions
npx eslint --fix src/logo/platforms
npx eslint --fix src/logo/dust