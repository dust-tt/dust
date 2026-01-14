import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const PLACEHOLDER_TOOL_NAME = "placeholder_tool";
export const TOOL_NOT_FOUND_MONITORING_NAME = "tool_not_found";

export const placeholderToolSchema = {};

// Note: This server dynamically creates tools based on runtime context.
// The placeholder_tool is the static fallback when no context is available.

export const MISSING_ACTION_CATCHER_TOOLS: MCPToolType[] = [
  {
    name: PLACEHOLDER_TOOL_NAME,
    description: "This tool is a placeholder to catch missing actions.",
    inputSchema: zodToJsonSchema(z.object(placeholderToolSchema)) as JSONSchema,
  },
];

export const MISSING_ACTION_CATCHER_SERVER_INFO = {
  name: "missing_action_catcher" as const,
  version: "1.0.0",
  description: "To be used to catch errors and avoid erroring.",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: null,
};
