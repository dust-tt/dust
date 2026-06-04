import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SKILL_AUTHORING_SERVER_NAME = "skill_authoring" as const;
export const LIST_SKILLS_TOOL_NAME = "list_skills" as const;
export const GET_SKILL_TOOL_NAME = "get_skill" as const;
export const CREATE_SKILL_TOOL_NAME = "create_skill" as const;
export const UPDATE_SKILL_TOOL_NAME = "update_skill" as const;

export const SKILL_AUTHORING_TOOLS_METADATA = createToolsRecord({
  [LIST_SKILLS_TOOL_NAME]: {
    description:
      "List active custom Skills in this workspace. Returns lightweight summaries so you can find the skill id to inspect or update.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing skills",
      done: "List skills",
    },
  },
  [GET_SKILL_TOOL_NAME]: {
    description:
      "Get the full details for one custom Skill by id, including its instructions.",
    schema: {
      sId: z.string().describe("The custom skill id to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting skill",
      done: "Get skill",
    },
  },
  [CREATE_SKILL_TOOL_NAME]: {
    description:
      "Create a new reusable Skill in this workspace: a named, reusable set of instructions an agent can later enable. v1 creates instructions-only skills.",
    schema: {
      name: z.string().describe("Unique, human-readable skill name."),
      userFacingDescription: z
        .string()
        .describe("Short description shown to users browsing skills."),
      agentFacingDescription: z
        .string()
        .describe(
          "Description used by agents to decide when to use the skill."
        ),
      instructions: z
        .string()
        .describe("The skill's instructions/playbook in markdown."),
      icon: z
        .string()
        .optional()
        .describe("Optional icon name; auto-suggested if omitted."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating skill",
      done: "Create skill",
    },
  },
  [UPDATE_SKILL_TOOL_NAME]: {
    description:
      "Update an existing custom Skill by id. Provide only the fields that should change. " +
      "To change the instructions you can either replace them wholesale with `instructions`, " +
      "or make a targeted edit with `old_string`/`new_string` (preferred for small changes). " +
      "These two modes are mutually exclusive.",
    schema: {
      sId: z.string().describe("The custom skill id to update."),
      name: z.string().optional().describe("New skill name."),
      userFacingDescription: z
        .string()
        .optional()
        .describe("New short description shown to users browsing skills."),
      agentFacingDescription: z
        .string()
        .optional()
        .describe("New description used by agents to decide when to use it."),
      instructions: z
        .string()
        .optional()
        .describe(
          "New skill instructions/playbook in markdown. Replaces the instructions " +
            "entirely. For small, targeted changes prefer `old_string`/`new_string`. " +
            "Cannot be combined with `old_string`/`new_string`."
        ),
      old_string: z
        .string()
        .optional()
        .describe(
          "For a targeted edit of the instructions: the exact existing text to replace. " +
            "Must match the current instructions exactly, including whitespace and line " +
            "breaks. Include enough surrounding context to identify the text uniquely. " +
            "Call `get_skill` first to read the current instructions. Cannot be combined " +
            "with `instructions`."
        ),
      new_string: z
        .string()
        .optional()
        .describe(
          "The replacement text for `old_string`. Use an empty string to delete the " +
            "matched text. Required when `old_string` is provided."
        ),
      expected_replacements: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Number of occurrences of `old_string` expected to be replaced. Defaults to 1. " +
            "The edit fails if the actual count differs."
        ),
      icon: z.string().optional().describe("New icon name."),
    },
    stake: "high",
    displayLabels: {
      running: "Updating skill",
      done: "Update skill",
    },
  },
});

export const SKILL_AUTHORING_SERVER = {
  serverInfo: {
    name: SKILL_AUTHORING_SERVER_NAME,
    version: "1.0.0",
    description: "Create and update reusable workspace Skills.",
    authorization: null,
    icon: "ActionListCheckIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(SKILL_AUTHORING_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SKILL_AUTHORING_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
