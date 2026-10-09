// index-template.js
const path = require("path");

function defaultIndexTemplate(filePaths) {
  const basenames = filePaths
    .map(({ path: filePath }) =>
      path.basename(filePath, path.extname(filePath))
    )
    .sort();
  const exportEntries = basenames.map(
    (basename) => `export { default as ${basename} } from './${basename}'`
  );
  return exportEntries.join("\n");
}

module.exports = defaultIndexTemplate;
