import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  DEEP_DIVE_NAME,
  DEEP_DIVE_SERVER_INSTRUCTIONS,
} from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
import type { MCPToolType } from "@app/lib/api/mcp";

// Tool names.
export const HANDOFF_TOOL_NAME = "handoff";

// Tool monitoring names.
export const HANDOFF_MONITORING_NAME = "handoff";

export const handoffSchema = {};

export const DEEP_DIVE_TOOLS: MCPToolType[] = [
  {
    name: HANDOFF_TOOL_NAME,
    description: `Hand off the task to @${DEEP_DIVE_NAME} agent for comprehensive analysis across company data, databases, and web sources.`,
    inputSchema: zodToJsonSchema(z.object(handoffSchema)) as JSONSchema,
  },
];

export const DEEP_DIVE_SERVER_INFO = {
  name: "deep_dive" as const,
  version: "0.1.0",
  description: `Hand off complex questions to the @${DEEP_DIVE_NAME} agent for comprehensive analysis across company data, databases, and web sources—thorough analysis that may take several minutes.`,
  authorization: null,
  icon: "ActionAtomIcon" as const,
  documentationUrl: "https://docs.dust.tt/docs/go-deep",
  instructions: DEEP_DIVE_SERVER_INSTRUCTIONS,
};
