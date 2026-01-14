import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

export const AGENT_MANAGEMENT_TOOL_NAME = "agent_management_create_agent";

// =============================================================================
// Zod Schemas - Used by server file for runtime validation
// =============================================================================

export const createAgentSchema = {
  name: z
    .string()
    .describe(
      "The name of the agent (must be unique). Only letters, numbers, underscores (_) and hyphens (-) are allowed. Maximum 30 characters."
    ),
  description: z
    .string()
    .describe("A brief description of what the agent does"),
  instructions: z
    .string()
    .describe("The prompt/instructions that define the agent's behavior"),
  emoji: z
    .string()
    .optional()
    .describe(
      "An emoji character to use as the agent's avatar (e.g., '🤖'). If not provided, defaults to '🤖'"
    ),
  sub_agent_name: z
    .string()
    .optional()
    .describe(
      "The name of the sub-agent to create. If provided, sub_agent_description and sub_agent_instructions must also be provided."
    ),
  sub_agent_description: z
    .string()
    .optional()
    .describe("A brief description of what the sub-agent does"),
  sub_agent_instructions: z
    .string()
    .optional()
    .describe("The prompt/instructions that define the sub-agent's behavior"),
  sub_agent_emoji: z
    .string()
    .optional()
    .describe(
      "An emoji character to use as the sub-agent's avatar (e.g., '🤔'). If not provided, defaults to '🤖'"
    ),
};

// =============================================================================
// Tool Definitions - Used by constants.ts for static metadata
// =============================================================================

export const AGENT_MANAGEMENT_TOOLS: MCPToolType[] = [
  {
    name: "create_agent",
    description: "Create a new agent.",
    inputSchema: zodToJsonSchema(z.object(createAgentSchema)) as JSONSchema,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const AGENT_MANAGEMENT_SERVER_INFO = {
  name: "agent_management" as const,
  version: "1.0.0",
  description: "Tools for managing agent configurations.",
  authorization: null,
  icon: "ActionRobotIcon" as const,
  documentationUrl: null,
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const AGENT_MANAGEMENT_TOOL_STAKES = {
  create_agent: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;
