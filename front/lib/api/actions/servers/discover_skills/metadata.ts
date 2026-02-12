import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import {
  ENABLE_DISCOVERED_SKILL_TOOL_NAME,
  SEARCH_SKILLS_TOOL_NAME,
} from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const DISCOVER_SKILLS_TOOLS_METADATA = createToolsRecord({
  [SEARCH_SKILLS_TOOL_NAME]: {
    description:
      "Search for available skills in the workspace. " +
      "Returns skills that can be enabled for the current conversation.",
    schema: {
      query: z
        .string()
        .optional()
        .describe(
          "Optional search query to filter skills by name or description."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching skills",
      done: "Search skills",
    },
  },
  [ENABLE_DISCOVERED_SKILL_TOOL_NAME]: {
    description:
      "Enable a discovered skill for the current conversation. " +
      "The skill will be available for subsequent messages from the same agent in this conversation.",
    schema: {
      skillName: z
        .string()
        .describe("The name of the skill to enable (as returned by search)."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Enabling skill",
      done: "Enable skill",
    },
  },
});

type DiscoverSkillsToolKey = keyof typeof DISCOVER_SKILLS_TOOLS_METADATA;

export const DISCOVER_SKILLS_SERVER = {
  serverInfo: {
    name: "discover_skills" as const,
    version: "1.0.0",
    description: "Search and enable skills for the current conversation.",
    authorization: null,
    icon: "PuzzleIcon" as const,
    documentationUrl: null,
    instructions: null,
  },
  tools: (
    Object.keys(DISCOVER_SKILLS_TOOLS_METADATA) as DiscoverSkillsToolKey[]
  ).map((key) => ({
    name: DISCOVER_SKILLS_TOOLS_METADATA[key].name,
    description: DISCOVER_SKILLS_TOOLS_METADATA[key].description,
    inputSchema: zodToJsonSchema(
      z.object(DISCOVER_SKILLS_TOOLS_METADATA[key].schema)
    ) as JSONSchema,
    displayLabels: DISCOVER_SKILLS_TOOLS_METADATA[key].displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    (
      Object.keys(DISCOVER_SKILLS_TOOLS_METADATA) as DiscoverSkillsToolKey[]
    ).map((key) => [key, DISCOVER_SKILLS_TOOLS_METADATA[key].stake])
  ),
} as const satisfies ServerMetadata;
