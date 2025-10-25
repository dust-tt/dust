// CommonJS wrapper for ESLint flat config.
// Some environments/tools explicitly load eslint.config.js.
// Delegate to the canonical CommonJS config.
module.exports = require("./eslint.config.cjs");
