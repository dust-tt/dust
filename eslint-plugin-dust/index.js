"use strict";

const tooLongIndexName = require("./rules/too-long-index-name");
const nextjsNoDataFetchingInGetssp = require("./rules/nextjs-no-data-fetching-in-getssp");
const nextjsPageComponentNaming = require("./rules/nextjs-page-component-naming");

const plugin = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {
    "too-long-index-name": tooLongIndexName,
    "nextjs-no-data-fetching-in-getssp": nextjsNoDataFetchingInGetssp,
    "nextjs-page-component-naming": nextjsPageComponentNaming,
  },
};

// Support both CommonJS and ESM
module.exports = plugin;
module.exports.default = plugin;
