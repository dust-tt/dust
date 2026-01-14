import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolType } from "@app/lib/api/mcp";

// Re-export tool name from constants for backward compatibility.
export { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";

export const enableSkillSchema = {
  skillName: z.string().describe("The name of the skill to enable"),
};

export const SKILL_MANAGEMENT_TOOLS: MCPToolType[] = [
  {
    name: "enable_skill",
    description:
      "Enable a skill for the current conversation. " +
      "The skill will be available for subsequent messages from the same agent in this conversation.",
    inputSchema: zodToJsonSchema(z.object(enableSkillSchema)) as JSONSchema,
  },
];

export const SKILL_MANAGEMENT_SERVER_INFO = {
  name: "skill_management" as const,
  version: "1.0.0",
  description: "",
  icon: "PuzzleIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};
