// Keeping register here in the root for backwards compatibiliy, TODO remove in the next major version
console.warn(
  'typescript-transform-paths: Calling the top level "nx-transformer" file is deprecated and was removed in v4. Use "typescript-transform-paths/plugins/nx" instead',
);

module.exports = require("./dist/plugins/nx-transfomer-plugin").default;
