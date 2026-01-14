import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const LIST_TOOLSETS_TOOL_NAME = "list";
export const ENABLE_TOOLSET_TOOL_NAME = "enable";

// Monitoring names.
export const LIST_TOOLSETS_MONITORING_NAME = "list_toolsets";
export const ENABLE_TOOLSET_MONITORING_NAME = "enable_toolset";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const listToolsetsSchema = {};

export const enableToolsetSchema = {
  toolsetId: z.string(),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const TOOLSETS_TOOLS: MCPToolType[] = [
  {
    name: LIST_TOOLSETS_TOOL_NAME,
    description:
      "List the available toolsets with their names and descriptions. This is like using 'ls' in Unix.",
    inputSchema: zodToJsonSchema(z.object(listToolsetsSchema)) as JSONSchema,
  },
  {
    name: ENABLE_TOOLSET_TOOL_NAME,
    description: "Enable a toolset for this conversation.",
    inputSchema: zodToJsonSchema(z.object(enableToolsetSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const TOOLSETS_SERVER_INFO = {
  name: "toolsets" as const,
  version: "1.0.0",
  description: "Browse available toolsets and functions.",
  authorization: null,
  icon: "ActionLightbulbIcon" as const,
  documentationUrl: null,
  instructions: null,
};
