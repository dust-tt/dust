"use strict";

const plugin = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {},
};

// Support both CommonJS and ESM
module.exports = plugin;
module.exports.default = plugin;
