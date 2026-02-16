"use strict";

const noUnverifiedWorkspaceBypass = require("./rules/no-unverified-workspace-bypass");
const tooLongIndexName = require("./rules/too-long-index-name");
const noDirectSparkleNotification = require("./rules/no-direct-sparkle-notification");
const enforceClientTypesInPublicApi = require("./rules/enforce-client-types-in-public-api");
const nextjsNoDataFetchingInGetssp = require("./rules/nextjs-no-data-fetching-in-getssp");
const nextjsPageComponentNaming = require("./rules/nextjs-page-component-naming");
const noNextImports = require("./rules/no-next-imports");
const noMcpServerInstructions = require("./rules/no-mcp-server-instructions");

const plugin = {
  meta: {
    name: "eslint-plugin-dust",
    version: "0.0.0",
  },
  rules: {
    "no-unverified-workspace-bypass": noUnverifiedWorkspaceBypass,
    "too-long-index-name": tooLongIndexName,
    "no-direct-sparkle-notification": noDirectSparkleNotification,
    "enforce-client-types-in-public-api": enforceClientTypesInPublicApi,
    "nextjs-no-data-fetching-in-getssp": nextjsNoDataFetchingInGetssp,
    "nextjs-page-component-naming": nextjsPageComponentNaming,
    "no-next-imports": noNextImports,
    "no-mcp-server-instructions": noMcpServerInstructions,
  },
};

// Support both CommonJS and ESM
module.exports = plugin;
module.exports.default = plugin;
