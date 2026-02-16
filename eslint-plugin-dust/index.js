"use strict";

const tooLongIndexName = require("./rules/too-long-index-name");

const plugin = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {
    "too-long-index-name": tooLongIndexName,
  },
};

// Support both CommonJS and ESM
module.exports = plugin;
module.exports.default = plugin;
