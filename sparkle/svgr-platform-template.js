// index-template.js
const path = require("path");
const { sortExports } = require("./svgr-export-sort-template");

function defaultIndexTemplate(filePaths) {
  const exportEntries = filePaths.map(({ path: filePath }) => {
    const basename = path.basename(filePath, path.extname(filePath));
    return {
      from: `./${basename}`,
      statement: `export { default as ${basename}Logo } from './${basename}'`,
    };
  });
  // `registry.ts` is hand-maintained and lives alongside the generated files,
  // so it has to be re-exported from here or `PLATFORM_LOGOS` and the retired
  // logo aliases disappear from the package on every rebuild.
  exportEntries.push({
    from: "./registry",
    statement: `export * from './registry'`,
  });
  return sortExports(exportEntries).join("\n");
}

module.exports = defaultIndexTemplate;
