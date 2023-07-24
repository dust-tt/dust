#!/bin/sh

rm -rf src/icons/mini
rm -rf src/icons/solid
rm -rf src/icons/solid_stroke

npx @svgr/cli --out-dir src/icons/mini/ src/icons/src/mini/
npx @svgr/cli --out-dir src/icons/solid/ src/icons/src/solid/
npx @svgr/cli --out-dir src/icons/solid_stroke/ src/icons/src/solid_stroke/