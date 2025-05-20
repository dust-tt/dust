"use strict";

const noRawSqlRule = require("./rules/no-raw-sql");
const noUnverifiedWorkspaceBypass = require("./rules/no-unverified-workspace-bypass");
const tooLongIndexName = require("./rules/too-long-index-name");

module.exports = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {
    "no-raw-sql": noRawSqlRule,
    "no-unverified-workspace-bypass": noUnverifiedWorkspaceBypass,
    "too-long-index-name": tooLongIndexName,
  },
};
