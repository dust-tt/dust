#!/bin/sh

rm -rf src/icons/v2-stroke
rm -rf src/logo/dust

# Everything in src/logo/platforms is generated except the hand-maintained
# registry.ts, so clear the generated files individually rather than the folder.
find src/logo/platforms -name '*.tsx' -delete
rm -f src/logo/platforms/index.ts

npx @svgr/cli --no-prettier --index-template svgr-v2-stroke-icon-template.js --out-dir src/icons/v2-stroke/ src/icons/src/v2-stroke
# Platform logos are brand marks — a fixed ink colour on a coloured or light
# chip — so their palette must survive the conversion untouched. svgr.config.js
# rewrites black to `currentColor`, which is right for stroke icons and the Dust
# mono logos but would leave these marks invisible against their own chip in
# dark mode. --no-runtime-config skips that file, so its other options are
# repeated here explicitly.
npx @svgr/cli --no-prettier --no-runtime-config --icon --typescript --expand-props end --index-template svgr-platform-template.js --out-dir src/logo/platforms/ src/logo/src/platforms/
npx @svgr/cli --no-prettier --index-template svgr-logo-template.js --out-dir src/logo/dust/ src/logo/src/dust/

# Format and lint generated files with Biome
npx biome check --write .