import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const AGENT_MANAGEMENT_TOOL_NAME = "agent_management" as const;

// Tools metadata with exhaustive keys
export const AGENT_MANAGEMENT_TOOLS_METADATA = createToolsRecord({
  create_agent: {
    description: "Create a new agent.",
    schema: {
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
        .describe(
          "The prompt/instructions that define the sub-agent's behavior"
        ),
      sub_agent_emoji: z
        .string()
        .optional()
        .describe(
          "An emoji character to use as the sub-agent's avatar (e.g., '🤔'). If not provided, defaults to '🤖'"
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Creating agent",
      done: "Create agent",
    },
  },
});

// Server metadata - used in constants.ts
export const AGENT_MANAGEMENT_SERVER = {
  serverInfo: {
    name: "agent_management",
    version: "1.0.0",
    description: "Tools for managing agent configurations.",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(AGENT_MANAGEMENT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AGENT_MANAGEMENT_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
