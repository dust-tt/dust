#!/bin/sh

rm -rf src/icons/stroke
rm -rf src/icons/solid
rm -rf src/logo/platforms
rm -rf src/logo/dust

npx @svgr/cli --out-dir src/icons/stroke/ src/icons/src/stroke/
npx @svgr/cli --out-dir src/icons/solid/ src/icons/src/solid/
npx @svgr/cli --out-dir src/logo/platforms/ src/logo/src/platforms/
npx @svgr/cli --out-dir src/logo/dust/ src/logo/src/dust/

npx eslint --fix src/icons/stroke
npx eslint --fix src/icons/solid
npx eslint --fix src/logo/platforms
npx eslint --fix src/logo/dust