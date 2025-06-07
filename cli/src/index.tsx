#!/usr/bin/env node

import { render } from "ink";
import meow from "meow";
import React from "react";
import updateNotifier from "update-notifier";

import pkg from "../package.json" with { type: "json" };
import App from "./ui/App.js";
import { startMcpServerStdio } from "./utils/mcpServerStdio.js"; 

updateNotifier({
  pkg,
  updateCheckInterval: 1000 * 60 * 60 * 24, // 24 hours
}).notify({
  isGlobal: true,
  message:
    "Update available {currentVersion} → {latestVersion}\nRun {updateCommand} to update",
});

const cli = meow({
  importMeta: import.meta,
  autoHelp: false,
  flags: {
    version: {
      type: "boolean",
      shortFlag: "v",
    },
    force: {
      type: "boolean",
      shortFlag: "f",
    },
    help: {
      type: "boolean",
    },
    port: {
      type: "number",
      shortFlag: "p",
      description: "Specify the port for the MCP server",
    },
    sId: {
      type: "string",
      shortFlag: "s",
      isMultiple: true,
      description: "Specify agent sId(s) to use directly (can be repeated)",
    },
    transport: {
      type: "string",
      shortFlag: "t",
      description: "Specify the transport type: sse (default) or stdio",
    },
  },
});

// Handle stdio transport mode without Ink
if (cli.input[0] === "agents-mcp" && cli.flags.transport === "stdio") {
  const sIds = cli.flags.sId;
  if (!sIds || sIds.length === 0) {
    console.error("Error: At least one agent sId is required for stdio transport mode.");
    console.error("Usage: dust agents-mcp --transport stdio --sId <agentId>");
    process.exit(1);
  }
  
  void startMcpServerStdio(sIds).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
} else {
  render(<App cli={cli} />);
}
