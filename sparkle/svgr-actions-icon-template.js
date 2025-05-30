// index-template.js
const path = require("path");

function defaultIndexTemplate(filePaths) {
  const exportEntries = filePaths.map(({ path: filePath, originalPath }) => {
    const basename = path.basename(filePath, path.extname(filePath));
    return `export { default as Action${basename}Icon } from './${basename}'`;
  });
  return exportEntries.join("\n");
}

module.exports = defaultIndexTemplate;
