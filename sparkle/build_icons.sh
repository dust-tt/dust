#!/bin/sh

rm -rf src/icons/v2-stroke
rm -rf src/logo/dust

# Everything in src/logo/platforms is generated except the hand-maintained
# registry.ts, so clear the generated files individually rather than the folder.
find src/logo/platforms -name '*.tsx' -delete
rm -f src/logo/platforms/index.ts

# `src/icons/flags/index.ts` and `countries.ts` are hand-maintained next to the
# generated `circle` directory, so only that directory is cleared.
rm -rf src/icons/flags/circle

npx @svgr/cli --no-prettier --template svgr-component-template.js --index-template svgr-v2-stroke-icon-template.js --out-dir src/icons/v2-stroke/ src/icons/src/v2-stroke
# Platform logos are brand marks — a fixed ink colour on a coloured or light
# chip — so their palette must survive the conversion untouched. svgr.config.js
# rewrites black to `currentColor`, which is right for stroke icons and the Dust
# mono logos but would leave these marks invisible against their own chip in
# dark mode. --no-runtime-config skips that file, so its other options are
# repeated here explicitly.
npx @svgr/cli --no-prettier --no-runtime-config --icon --typescript --expand-props end --template svgr-component-template.js --index-template svgr-platform-template.js --out-dir src/logo/platforms/ src/logo/src/platforms/
npx @svgr/cli --no-prettier --template svgr-component-template.js --index-template svgr-logo-template.js --out-dir src/logo/dust/ src/logo/src/dust/
# Country flags are coloured marks like the platform logos (52 of them use a
# black fill), so they take the same --no-runtime-config path. The index template
# emits a single `FLAGS` record keyed by country code instead of named exports.
npx @svgr/cli --no-prettier --no-runtime-config --icon --typescript --expand-props end --template svgr-component-template.js --index-template svgr-flag-template.js --out-dir src/icons/flags/circle/ src/icons/src/flags/circle/

# SVGR drops blank lines and oxfmt does not add one after the imports, so add it here.
perl -pi -e 's/^(import \* as React from "react";)$/$1\n/' src/icons/v2-stroke/*.tsx src/logo/platforms/*.tsx src/logo/dust/*.tsx src/icons/flags/circle/*.tsx

# Format and lint generated files from the repo root so the root oxc configs apply
(cd .. && npx oxlint --fix sparkle/src/icons/v2-stroke sparkle/src/icons/flags sparkle/src/logo && npx oxfmt sparkle/src/icons/v2-stroke sparkle/src/icons/flags sparkle/src/logo)