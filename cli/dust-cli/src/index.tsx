#!/usr/bin/env node

import { initLogger, registerInkCleanup } from "./utils/logger.js";

if (!process.argv.includes("-m") && !process.argv.includes("--message")) {
  initLogger();
}

import { render } from "ink";
import meow from "meow";
import React from "react";

import App from "./ui/App.js";
import { configureSandbox } from "./utils/sandbox.js";

const cli = meow({
  importMeta: import.meta,
  autoHelp: false,
  autoVersion: false,
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
    agent: {
      type: "string",
      shortFlag: "a",
      description: "Search for and use an agent by name",
    },
    message: {
      type: "string",
      shortFlag: "m",
      description: "Send a message to the agent non-interactively",
    },
    conversationId: {
      type: "string",
      shortFlag: "c",
      description:
        "Conversation ID (use with --agent and --message, or with --messageId)",
    },
    messageId: {
      type: "string",
      description:
        "Display details of a specific message (requires --conversationId)",
    },
    details: {
      type: "boolean",
      shortFlag: "d",
      description:
        "Show detailed message information (requires --agent and --message)",
    },
    auto: {
      type: "boolean",
      description:
        "Always accept edit operations without prompting for approval",
    },
    noUpdateCheck: {
      type: "boolean",
      description: "Skip update check",
    },
    key: {
      type: "string",
      description: "Dust API key for headless authentication",
    },
    workspaceId: {
      type: "string",
      description: "Workspace ID for headless authentication",
    },
    resume: {
      type: "string",
      shortFlag: "r",
      description:
        "Resume a conversation by ID, or pass no value to pick from recent",
    },
    projectName: {
      type: "string",
      description: "Create conversation in a project by name",
    },
    projectId: {
      type: "string",
      description: "Create conversation in a project by space ID",
    },
    allowPath: {
      type: "string",
      isMultiple: true,
      description:
        "Grant file system tools access to a path outside the current directory (can be repeated)",
    },
    dangerouslyDisableSandbox: {
      type: "boolean",
      description:
        "Let file system tools reach anywhere on the machine, not just the current directory",
    },
    withTools: {
      type: "boolean",
      shortFlag: "t",
      description:
        "Enable file system tools in non-interactive mode (requires OAuth). WARNING: automatically approves ALL tool executions without prompting.",
    },
  },
});

configureSandbox({
  allowPaths: cli.flags.allowPath,
  disabled: cli.flags.dangerouslyDisableSandbox,
});

const instance = render(<App cli={cli} />);
registerInkCleanup(() => instance.unmount());
