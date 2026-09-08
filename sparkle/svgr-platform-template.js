// index-template.js
const path = require("path");

function defaultIndexTemplate(filePaths) {
  const exportEntries = filePaths.map(({ path: filePath }) => {
    const basename = path.basename(filePath, path.extname(filePath));
    return `export { default as ${basename}Logo } from './${basename}'`;
  });
  // `registry.ts` is hand-maintained and lives alongside the generated files,
  // so it has to be re-exported from here or `PLATFORM_LOGOS` and the retired
  // logo aliases disappear from the package on every rebuild.
  exportEntries.push(`export * from './registry'`);
  return exportEntries.join("\n");
}

module.exports = defaultIndexTemplate;
