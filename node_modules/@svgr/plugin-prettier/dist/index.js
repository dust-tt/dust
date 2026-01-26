'use strict';

var prettier = require('prettier');
var deepmerge = require('deepmerge');

const prettierPlugin = (code, config, state) => {
  if (!config.prettier)
    return code;
  const filePath = state.filePath || process.cwd();
  const prettierRcConfig = config.runtimeConfig ? prettier.resolveConfig.sync(filePath, { editorconfig: true }) : {};
  return prettier.format(
    code,
    deepmerge.all([
      { parser: "babel" },
      prettierRcConfig || {},
      config.prettierConfig || {}
    ])
  );
};

module.exports = prettierPlugin;
//# sourceMappingURL=index.js.map
