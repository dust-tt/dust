import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const SKILL_MANAGEMENT_TOOLS_METADATA = [
  {
    name: ENABLE_SKILL_TOOL_NAME,
    description:
      "Enable a skill for the current conversation. " +
      "The skill will be available for subsequent messages from the same agent in this conversation.",
    schema: {
      skillName: z.string().describe("The name of the skill to enable"),
    },
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Enabling skill",
      done: "Enable skill",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const satisfies readonly InternalMCPToolType[];

export const SKILL_MANAGEMENT_SERVER = {
  serverInfo: {
    name: "skill_management" as const,
    version: "1.0.0",
    description: "",
    authorization: null,
    icon: "PuzzleIcon" as const,
    documentationUrl: null,
  },
  tools: SKILL_MANAGEMENT_TOOLS_METADATA,
} as const satisfies ServerMetadata;
