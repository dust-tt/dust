import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const TOOLSETS_TOOLS_METADATA = [
  {
    name: "list",
    description:
      "List the available toolsets with their names and descriptions. This is like using 'ls' in Unix.",
    schema: {},
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Listing tools",
      done: "List tools",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "enable",
    description: "Enable a toolset for this conversation.",
    schema: {
      toolsetId: z.string().describe("The ID of the toolset to enable."),
    },
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Enabling tool",
      done: "Enabled tool",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const TOOLSETS_SERVER = {
  serverInfo: {
    name: "toolsets",
    version: "1.0.0",
    description: "Browse available toolsets and functions.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
  },
  tools: TOOLSETS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
