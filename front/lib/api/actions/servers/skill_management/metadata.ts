import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SKILL_MANAGEMENT_TOOL_NAME = "skill_management" as const;

export const SKILL_MANAGEMENT_TOOLS_METADATA = createToolsRecord({
  [ENABLE_SKILL_TOOL_NAME]: {
    description:
      "Enable a skill for the current conversation. " +
      "The skill will be available for subsequent messages from the same agent in this conversation.",
    schema: {
      skillName: z.string().describe("The name of the skill to enable"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Enabling skill",
      done: "Enable skill",
    },
  },
});

type SkillManagementToolKey = keyof typeof SKILL_MANAGEMENT_TOOLS_METADATA;

export const SKILL_MANAGEMENT_SERVER = {
  serverInfo: {
    name: "skill_management" as const,
    version: "1.0.0",
    description: "",
    authorization: null,
    icon: "PuzzleIcon" as const,
    documentationUrl: null,
    instructions: null,
  },
  tools: (
    Object.keys(SKILL_MANAGEMENT_TOOLS_METADATA) as SkillManagementToolKey[]
  ).map((key) => ({
    name: SKILL_MANAGEMENT_TOOLS_METADATA[key].name,
    description: SKILL_MANAGEMENT_TOOLS_METADATA[key].description,
    inputSchema: zodToJsonSchema(
      z.object(SKILL_MANAGEMENT_TOOLS_METADATA[key].schema)
    ) as JSONSchema,
    displayLabels: SKILL_MANAGEMENT_TOOLS_METADATA[key].displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    (
      Object.keys(SKILL_MANAGEMENT_TOOLS_METADATA) as SkillManagementToolKey[]
    ).map((key) => [key, SKILL_MANAGEMENT_TOOLS_METADATA[key].stake])
  ),
} as const satisfies ServerMetadata;
