"use strict";

const noRawSqlRule = require("./rules/no-raw-sql");
const noUnverifiedWorkspaceBypass = require("./rules/no-unverified-workspace-bypass");
const tooLongIndexName = require("./rules/too-long-index-name");
const noDirectSparkleNotification = require("./rules/no-direct-sparkle-notification");
const noBulkLodash = require("./rules/no-bulk-lodash.js");
const enforceClientTypesInPublicApi = require("./rules/enforce-client-types-in-public-api");
const nextjsNoDataFetchingInGetssp = require("./rules/nextjs-no-data-fetching-in-getssp");
const nextjsPageComponentNaming = require("./rules/nextjs-page-component-naming");
const noNextImports = require("./rules/no-next-imports");

const plugin = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {
    "no-raw-sql": noRawSqlRule,
    "no-unverified-workspace-bypass": noUnverifiedWorkspaceBypass,
    "too-long-index-name": tooLongIndexName,
    "no-direct-sparkle-notification": noDirectSparkleNotification,
    "no-bulk-lodash": noBulkLodash,
    "enforce-client-types-in-public-api": enforceClientTypesInPublicApi,
    "nextjs-no-data-fetching-in-getssp": nextjsNoDataFetchingInGetssp,
    "nextjs-page-component-naming": nextjsPageComponentNaming,
    "no-next-imports": noNextImports,
  },
};

// Support both CommonJS and ESM
module.exports = plugin;
module.exports.default = plugin;
