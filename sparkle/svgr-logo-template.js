// index-template.js
const path = require("path");
const { sortExports } = require("./svgr-export-sort-template");

function defaultIndexTemplate(filePaths) {
  const exportEntries = filePaths.map(({ path: filePath }) => {
    const basename = path.basename(filePath, path.extname(filePath));
    return {
      from: `./${basename}`,
      statement: `export { default as ${basename} } from './${basename}'`,
    };
  });
  return sortExports(exportEntries).join("\n");
}

module.exports = defaultIndexTemplate;
