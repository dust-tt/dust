// index-template.js
const path = require("path");

/**
 * Index template for the country flags directory (`src/icons/flags/circle/`).
 *
 * Flags are never imported by component name: `FlagIcon` resolves them from a
 * country code at render time, so instead of one named export per module this
 * emits a single `FLAGS` record keyed by the code the SVG source was named
 * with (`FR.svg` → `"FR"`, `GB-SCT.svg` → `"GB-SCT"`). The record is typed
 * against `FlagCode` so a source added or removed without a matching entry in
 * `countries.ts` fails the type check instead of silently rendering nothing.
 */
function flagIndexTemplate(filePaths) {
  const entries = filePaths
    .map(({ path: filePath, originalPath }) => {
      const moduleName = path.basename(filePath, path.extname(filePath));
      // SVGR pascal-cases the output filename (`GB-SCT.svg` → `GbSct.tsx`), so
      // the code has to come from the source path, not the generated one.
      const code = path.basename(originalPath, path.extname(originalPath));
      return { moduleName, code };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const imports = entries
    .map(({ moduleName }) => `import ${moduleName} from "./${moduleName}";`)
    .join("\n");
  const records = entries
    .map(({ moduleName, code }) => `  "${code}": ${moduleName},`)
    .join("\n");

  return [
    `import type { ComponentType, SVGProps } from "react";`,
    ``,
    `import type { FlagCode } from "../countries";`,
    ``,
    imports,
    ``,
    `export const FLAGS: Record<FlagCode, ComponentType<SVGProps<SVGSVGElement>>> = {`,
    records,
    `};`,
    ``,
  ].join("\n");
}

module.exports = flagIndexTemplate;
