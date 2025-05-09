"use strict";

const noRawSqlRule = require("./rules/no-raw-sql");

module.exports = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {
    "no-raw-sql": noRawSqlRule,
  },
};
