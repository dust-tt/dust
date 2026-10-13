import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { REASONING_EFFORT_DIRECTIONS } from "@app/types/assistant/models/reasoning";
import { z } from "zod";

export const SELF_CONFIGURATION_SERVER_NAME = "self_configuration" as const;
export const ADJUST_REASONING_EFFORT_TOOL_NAME = "adjust_reasoning_effort";

export const ADJUST_REASONING_EFFORT_SCHEMA = {
  direction: z
    .enum(REASONING_EFFORT_DIRECTIONS)
    .describe("Whether to raise or lower your reasoning effort by one step."),
};

export const SELF_CONFIGURATION_TOOLS_METADATA = [
  {
    name: ADJUST_REASONING_EFFORT_TOOL_NAME,
    description:
      "Raise or lower your reasoning effort by one step for the rest of the conversation, e.g. " +
      "raise it when the user's requests need deeper reasoning than you currently give (hard " +
      "math, intricate debugging, long multi-step analysis). The change applies from the user's " +
      "next message on: the answer you are writing keeps its current effort.",
    schema: ADJUST_REASONING_EFFORT_SCHEMA,
    stake: "never_ask",
    eager: true,
    displayLabels: {
      running: "Adjusting reasoning effort",
      done: "Adjust reasoning effort",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const SELF_CONFIGURATION_SERVER = {
  serverInfo: {
    name: SELF_CONFIGURATION_SERVER_NAME,
    version: "1.0.0",
    description: "Let the agent adjust its own configuration mid-conversation.",
    authorization: null,
    icon: "ActionBrainIcon",
    documentationUrl: null,
  },
  tools: SELF_CONFIGURATION_TOOLS_METADATA,
} as const satisfies ServerMetadata;
