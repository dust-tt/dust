import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { SkillInstructionEditItemSchema } from "@app/types/suggestions/skill_suggestion";
import { z } from "zod";

export const BUILDING_AGENTS_AND_SKILLS_SERVER_NAME =
  "building_agents_and_skills" as const;

export const DESCRIBE_SKILL_TOOL_NAME = "describe_skill" as const;
export const SUGGEST_SKILL_UPDATE_TOOL_NAME = "suggest_skill_update" as const;
export const SUGGEST_SKILL_EDITORS_TOOL_NAME = "suggest_skill_editors" as const;
export const CREATE_AGENT_TOOL_NAME = "create_agent" as const;

// Bounds the O(n²) pairwise conflict check in hasSuggestionSelfConflict; larger rewrites
// should target the instructions root block instead.
const MAX_INSTRUCTION_EDITS = 50;

export const SUGGEST_SKILL_UPDATE_INPUT_SCHEMA = z.object({
  skillId: z.string().describe("The id of the custom skill to update."),
  instructionEdits: z
    .array(SkillInstructionEditItemSchema)
    .max(MAX_INSTRUCTION_EDITS)
    .optional()
    .describe(
      "Block-targeted edits to the skill instructions. Each item targets one block by its " +
        `data-block-id (at most ${MAX_INSTRUCTION_EDITS} edits). Use ` +
        `"${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" as targetBlockId for a full rewrite.`
    ),
  agentFacingDescriptionEdit: z
    .object({
      content: z
        .string()
        .min(1)
        .max(AGENT_FACING_DESCRIPTION_MAX_LENGTH)
        .describe(
          "The full new agent-facing description (replaces the current one)."
        ),
    })
    .optional()
    .describe("Replacement for the skill's agent-facing description."),
  analysis: z
    .string()
    .optional()
    .describe("Why this change improves the skill."),
  title: z
    .string()
    .max(25)
    .optional()
    .describe(
      "A short, action-oriented user-facing title for this suggestion (at most 25 characters)."
    ),
});

export type SuggestSkillUpdateArgs = z.infer<
  typeof SUGGEST_SKILL_UPDATE_INPUT_SCHEMA
>;

export const SUGGEST_SKILL_EDITORS_INPUT_SCHEMA = z.object({
  skillId: z
    .string()
    .describe("The id of the custom skill whose editors to change."),
  addUserIds: z
    .array(z.string())
    .optional()
    .describe("sIds of the workspace members to add as editors of the skill."),
  removeUserIds: z
    .array(z.string())
    .optional()
    .describe("sIds of the current editors to remove from the skill."),
  analysis: z
    .string()
    .optional()
    .describe("Why this change to the editors is needed."),
  title: z
    .string()
    .max(25)
    .optional()
    .describe(
      "A short, action-oriented user-facing title for this suggestion (at most 25 characters)."
    ),
});

export type SuggestSkillEditorsArgs = z.infer<
  typeof SUGGEST_SKILL_EDITORS_INPUT_SCHEMA
>;

export const CREATE_AGENT_DESCRIPTION =
  "Create a new agent in this workspace: a named assistant with its own instructions. Unlike " +
  "`suggest_skill_update`, this creates the agent directly, not as a pending suggestion. v1 " +
  "creates instructions-only agents, private to their creator, using the workspace's default " +
  "model.";

export const CREATE_AGENT_INPUT_SCHEMA = z.object({
  name: z
    .string()
    .describe("Unique, human-readable agent name (no leading '@')."),
  description: z
    .string()
    .describe(
      "Short description of what the agent does, shown to users browsing agents."
    ),
  instructions: z.string().describe("The agent's instructions, in markdown."),
});

export type CreateAgentArgs = z.infer<typeof CREATE_AGENT_INPUT_SCHEMA>;

export const BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA = [
  {
    name: DESCRIBE_SKILL_TOOL_NAME,
    description:
      "Get a custom Skill's name, agent-facing description, and instructions as HTML whose blocks " +
      "carry a data-block-id.",
    schema: {
      skillId: z.string().describe("The id of the custom skill to describe."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing skill",
      done: "Describe skill",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_SKILL_UPDATE_TOOL_NAME,
    // TODO(conversational-building): consider splitting this into prompt and description
    description:
      "Suggest an update to an existing custom Skill. The change is not applied directly: it " +
      "is recorded as a pending suggestion that the skill's editors can review, accept, or " +
      "reject. Provide at least one of `instructionEdits` or `agentFacingDescriptionEdit`.",
    schema: SUGGEST_SKILL_UPDATE_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting skill update",
      done: "Suggest skill update",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_SKILL_EDITORS_TOOL_NAME,
    description:
      "Suggest a change to the editors of an existing custom Skill. The change is not applied " +
      "directly: it is recorded as a pending suggestion that the skill's editors can review, " +
      "accept, or reject. Provide user sIds in at least one of `addUserIds` or `removeUserIds`. " +
      "A change that would leave the skill without any editor is refused.",
    schema: SUGGEST_SKILL_EDITORS_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting skill editors change",
      done: "Suggest skill editors change",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: CREATE_AGENT_TOOL_NAME,
    description: CREATE_AGENT_DESCRIPTION,
    schema: CREATE_AGENT_INPUT_SCHEMA.shape,
    stake: "high",
    displayLabels: {
      running: "Creating agent",
      done: "Create agent",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const BUILDING_AGENTS_AND_SKILLS_SERVER = {
  serverInfo: {
    name: BUILDING_AGENTS_AND_SKILLS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Build and improve agents and skills from a conversation: create new agents directly, and " +
      "propose suggestions for existing skills that their editors can review.",
    authorization: null,
    icon: "ActionListCheckIcon",
    documentationUrl: null,
  },
  tools: BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
