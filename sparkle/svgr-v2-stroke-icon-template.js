// index-template.js
const path = require("path");

function defaultIndexTemplate(filePaths) {
  const exportEntries = filePaths.map(({ path: filePath, originalPath }) => {
    const basename = path.basename(filePath, path.extname(filePath));
    // "Container" would collide with the existing `Container` component export
    // from sparkle, so it is exported as `ContainerIcon` instead.
    const exportName = basename === "Container" ? "ContainerIcon" : basename;
    return `export { default as ${exportName} } from './${basename}'`;
  });
  return exportEntries.join("\n");
}

module.exports = defaultIndexTemplate;
