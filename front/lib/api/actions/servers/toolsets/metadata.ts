import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const TOOLSETS_TOOL_NAME = "toolsets" as const;

export const TOOLSETS_TOOLS_METADATA = createToolsRecord({
  list: {
    description:
      "List the available toolsets with their names and descriptions. This is like using 'ls' in Unix.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing toolsets",
      done: "List toolsets",
    },
  },
  enable: {
    description: "Enable a toolset for this conversation.",
    schema: {
      toolsetId: z.string().describe("The ID of the toolset to enable."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Enabling toolset",
      done: "Enable toolset",
    },
  },
});

export const TOOLSETS_SERVER = {
  serverInfo: {
    name: "toolsets",
    version: "1.0.0",
    description: "Browse available toolsets and functions.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(TOOLSETS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(TOOLSETS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
