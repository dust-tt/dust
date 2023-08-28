#!/bin/sh

rm -rf src/icons/stroke
rm -rf src/icons/solid

npx @svgr/cli --out-dir src/icons/stroke/ src/icons/src/stroke/
npx @svgr/cli --out-dir src/icons/solid/ src/icons/src/solid/

npx eslint --fix src/icons/stroke
npx eslint --fix src/icons/solid