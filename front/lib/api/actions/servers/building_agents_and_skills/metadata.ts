import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  AGENT_FACING_DESCRIPTION_MAX_LENGTH,
  USER_FACING_DESCRIPTION_MAX_LENGTH,
} from "@app/lib/skills/labels";
import { ModelIdSchema } from "@app/types/assistant/models/models";
import { ORDERED_REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import {
  SKILL_AVAILABILITIES,
  SKILL_NAME_MAX_LENGTH,
} from "@app/types/assistant/skill_configuration_constants";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { SkillInstructionEditItemSchema } from "@app/types/suggestions/skill_suggestion";
import { z } from "zod";

export const BUILDING_AGENTS_AND_SKILLS_SERVER_NAME =
  "building_agents_and_skills" as const;

export const DESCRIBE_SKILL_TOOL_NAME = "describe_skill" as const;
export const DESCRIBE_AGENT_TOOL_NAME = "describe_agent" as const;
export const SUGGEST_SKILL_UPDATE_TOOL_NAME = "suggest_skill_update" as const;
export const SUGGEST_SKILL_EDITORS_TOOL_NAME = "suggest_skill_editors" as const;
export const SUGGEST_SKILL_DELETION_TOOL_NAME =
  "suggest_skill_deletion" as const;
export const SUGGEST_AGENT_CREATION_TOOL_NAME =
  "suggest_agent_creation" as const;
export const SUGGEST_AGENT_DELETION_TOOL_NAME =
  "suggest_agent_deletion" as const;
export const SUGGEST_AGENT_DESCRIPTION_TOOL_NAME =
  "suggest_agent_description" as const;
export const SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME =
  "suggest_agent_model_change" as const;
export const SUGGEST_AGENT_NAME_TOOL_NAME = "suggest_agent_name" as const;
export const SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME =
  "suggest_agent_publish_state" as const;
export const SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME =
  "suggest_agent_instructions_change" as const;
export const SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME =
  "suggest_skill_user_facing_description" as const;
export const SUGGEST_SKILL_NAME_TOOL_NAME = "suggest_skill_name" as const;
export const SUGGEST_SKILL_AVAILABILITY_TOOL_NAME =
  "suggest_skill_availability" as const;

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

export const SUGGEST_SKILL_DELETION_DESCRIPTION =
  "Suggest deleting an existing custom Skill of this workspace. The skill is not deleted " +
  "directly: the proposal is recorded as a pending suggestion that the skill's editors can " +
  "review, accept, or reject. Only skills the caller can administrate can be targeted.";

export const SUGGEST_SKILL_DELETION_INPUT_SCHEMA = z.object({
  skillId: z.string().describe("The id of the custom skill to delete."),
  analysis: z.string().optional().describe("Why this skill should be deleted."),
});

export type SuggestSkillDeletionArgs = z.infer<
  typeof SUGGEST_SKILL_DELETION_INPUT_SCHEMA
>;

export const SUGGEST_AGENT_CREATION_DESCRIPTION =
  "Suggest creating a new agent in this workspace: a named assistant with its own instructions. " +
  "The change is not applied directly: it is recorded as a pending suggestion that the creator " +
  "can review, accept, or reject.";

export const SUGGEST_AGENT_CREATION_INPUT_SCHEMA = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .describe("Unique, human-readable agent name (no leading '@')."),
  description: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Short description of what the agent does, shown to users browsing agents."
    ),
  instructions: z
    .string()
    .trim()
    .min(1)
    .describe("The agent's instructions, as HTML."),
  analysis: z.string().optional().describe("Why this agent is needed."),
});

export type SuggestAgentCreationArgs = z.infer<
  typeof SUGGEST_AGENT_CREATION_INPUT_SCHEMA
>;

export const SUGGEST_AGENT_DELETION_DESCRIPTION =
  "Suggest deleting an existing agent of this workspace. The agent is not deleted directly: the " +
  "proposal is recorded as a pending suggestion that the agent's editors can review, accept, " +
  "or reject. Only agents the caller can edit can be targeted.";

export const SUGGEST_AGENT_DELETION_INPUT_SCHEMA = z.object({
  agentId: z.string().describe("The id of the agent to delete."),
  analysis: z.string().optional().describe("Why this agent should be deleted."),
});

export type SuggestAgentDeletionArgs = z.infer<
  typeof SUGGEST_AGENT_DELETION_INPUT_SCHEMA
>;

export const SUGGEST_AGENT_DESCRIPTION_DESCRIPTION =
  "Suggest a new description for an existing agent.";

export const SUGGEST_AGENT_DESCRIPTION_INPUT_SCHEMA = z.object({
  agentId: z
    .string()
    .describe("The id of the agent to change the description for."),
  description: z.string().min(1).describe("The new description."),
  analysis: z
    .string()
    .optional()
    .describe("Why this description is better than the current one."),
});

export type SuggestAgentDescriptionArgs = z.infer<
  typeof SUGGEST_AGENT_DESCRIPTION_INPUT_SCHEMA
>;

export const SUGGEST_AGENT_MODEL_CHANGE_DESCRIPTION =
  "Suggest changing the model, and optionally its reasoning effort, used by an existing agent " +
  "of this workspace. The change is not applied directly: it is recorded as a pending " +
  "suggestion that the agent's editors can review, accept, or reject. Only agents the caller " +
  "can edit can be targeted.";

export const SUGGEST_AGENT_MODEL_CHANGE_INPUT_SCHEMA = z.object({
  agentId: z.string().describe("The id of the agent whose model to change."),
  modelId: ModelIdSchema.describe("The id of the new model for the agent."),
  reasoningEffort: z
    .enum(ORDERED_REASONING_EFFORTS)
    .optional()
    .describe(
      "The reasoning effort to use with the new model, if the model supports more than one."
    ),
  analysis: z
    .string()
    .optional()
    .describe("Why this model change improves the agent."),
});

export type SuggestAgentModelChangeArgs = z.infer<
  typeof SUGGEST_AGENT_MODEL_CHANGE_INPUT_SCHEMA
>;

export const SUGGEST_AGENT_NAME_DESCRIPTION =
  "Suggest a new name for an existing agent.";

export const SUGGEST_AGENT_NAME_INPUT_SCHEMA = z.object({
  agentId: z.string().describe("The id of the agent to rename."),
  name: z.string().min(1).describe("The new name, without a leading '@'"),
  analysis: z
    .string()
    .optional()
    .describe("Why this name is clearer than the current one."),
});

export type SuggestAgentNameArgs = z.infer<
  typeof SUGGEST_AGENT_NAME_INPUT_SCHEMA
>;

export const SUGGEST_AGENT_PUBLISH_STATE_DESCRIPTION =
  "Suggest publishing or unpublishing an existing agent.";

export const SUGGEST_AGENT_PUBLISH_STATE_INPUT_SCHEMA = z.object({
  agentId: z.string().describe("The id of the agent to publish or unpublish."),
  scope: z
    .enum(["hidden", "visible"])
    .describe(
      "The new publish state: 'visible' to publish the agent (visible to the " +
        "whole workspace), 'hidden' to unpublish it (visible to editors only)."
    ),
  analysis: z
    .string()
    .optional()
    .describe("Why the agent should be published or unpublished."),
});

export type SuggestAgentPublishStateArgs = z.infer<
  typeof SUGGEST_AGENT_PUBLISH_STATE_INPUT_SCHEMA
>;

export const SUGGEST_AGENT_INSTRUCTIONS_CHANGE_DESCRIPTION =
  "Suggest a change to an existing agent's instructions (prompt) of this workspace, using " +
  "block-based targeting. The instructions HTML contains blocks with a data-block-id " +
  "attribute; the edit targets one block by its id and provides the full replacement HTML " +
  `for that block. Use "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" as targetBlockId for a full ` +
  "rewrite. Call this tool once per block to change several blocks. The change is not " +
  "applied directly: it is recorded as a pending suggestion that the agent's editors can " +
  "review, accept, or reject. Only agents the caller can edit can be targeted.";

export const SUGGEST_AGENT_INSTRUCTIONS_CHANGE_INPUT_SCHEMA = z.object({
  agentId: z
    .string()
    .describe("The id of the agent whose instructions to change."),
  instructionEdit: SkillInstructionEditItemSchema.describe(
    "A block-targeted edit to the agent's instructions, targeting one block by its " +
      `data-block-id. Use "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" as targetBlockId for a ` +
      "full rewrite."
  ),
  analysis: z
    .string()
    .optional()
    .describe("Why this change improves the agent's instructions."),
});

export type SuggestAgentInstructionsChangeArgs = z.infer<
  typeof SUGGEST_AGENT_INSTRUCTIONS_CHANGE_INPUT_SCHEMA
>;

export const SUGGEST_SKILL_USER_FACING_DESCRIPTION_INPUT_SCHEMA = z.object({
  skillId: z
    .string()
    .describe(
      "The id of the custom skill whose user-facing description to change."
    ),
  userFacingDescription: z
    .string()
    .min(1)
    .max(USER_FACING_DESCRIPTION_MAX_LENGTH)
    .describe(
      "The full new user-facing description (replaces the current one): the short text " +
        `members read when browsing skills, at most ${USER_FACING_DESCRIPTION_MAX_LENGTH} characters.`
    ),
  analysis: z
    .string()
    .optional()
    .describe("Why this description is clearer for members."),
  title: z
    .string()
    .max(25)
    .optional()
    .describe(
      "A short, action-oriented user-facing title for this suggestion (at most 25 characters)."
    ),
});

export type SuggestSkillUserFacingDescriptionArgs = z.infer<
  typeof SUGGEST_SKILL_USER_FACING_DESCRIPTION_INPUT_SCHEMA
>;

export const SUGGEST_SKILL_NAME_INPUT_SCHEMA = z.object({
  skillId: z.string().describe("The id of the custom skill to rename."),
  name: z
    .string()
    .min(1)
    .max(SKILL_NAME_MAX_LENGTH)
    .describe(
      `The full new name (replaces the current one), at most ${SKILL_NAME_MAX_LENGTH} characters. ` +
        "It must be unique among the workspace's active skills."
    ),
  analysis: z
    .string()
    .optional()
    .describe("Why this name is clearer than the current one."),
  title: z
    .string()
    .max(25)
    .optional()
    .describe(
      "A short, action-oriented user-facing title for this suggestion (at most 25 characters)."
    ),
});

export type SuggestSkillNameArgs = z.infer<
  typeof SUGGEST_SKILL_NAME_INPUT_SCHEMA
>;

export const SUGGEST_SKILL_AVAILABILITY_INPUT_SCHEMA = z.object({
  skillId: z
    .string()
    .describe("The id of the custom skill whose availability to change."),
  availability: z
    .enum(SKILL_AVAILABILITIES)
    .describe(
      "Who the skill will be available to: `editors` (unpublished, editors only), " +
        "`workspace_users` (every member can find and use it), or `users_and_agents` " +
        "(members and agents, which may pick it on their own)."
    ),
  analysis: z
    .string()
    .optional()
    .describe("Why the skill should be available to this audience."),
  title: z
    .string()
    .max(25)
    .optional()
    .describe(
      "A short, action-oriented user-facing title for this suggestion (at most 25 characters)."
    ),
});

export type SuggestSkillAvailabilityArgs = z.infer<
  typeof SUGGEST_SKILL_AVAILABILITY_INPUT_SCHEMA
>;

export const BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA = [
  {
    name: DESCRIBE_SKILL_TOOL_NAME,
    description:
      "Get a custom Skill's name, availability, self-improvement mode, user-facing and " +
      "agent-facing descriptions, editors, and instructions as HTML whose blocks carry a " +
      "data-block-id.",
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
    name: DESCRIBE_AGENT_TOOL_NAME,
    description:
      "Get an agent's name, description, scope, model, skills, tools, and instructions as " +
      "HTML whose blocks carry a data-block-id, required to target block-level instruction " +
      "edits.",
    schema: {
      agentId: z.string().describe("The id of the agent to describe."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing agent",
      done: "Describe agent",
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
    name: SUGGEST_SKILL_DELETION_TOOL_NAME,
    description: SUGGEST_SKILL_DELETION_DESCRIPTION,
    schema: SUGGEST_SKILL_DELETION_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting skill deletion",
      done: "Suggest skill deletion",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_AGENT_CREATION_TOOL_NAME,
    description: SUGGEST_AGENT_CREATION_DESCRIPTION,
    schema: SUGGEST_AGENT_CREATION_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting a new agent",
      done: "Suggest new agent",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_AGENT_DELETION_TOOL_NAME,
    description: SUGGEST_AGENT_DELETION_DESCRIPTION,
    schema: SUGGEST_AGENT_DELETION_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting agent deletion",
      done: "Suggest agent deletion",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_AGENT_DESCRIPTION_TOOL_NAME,
    description: SUGGEST_AGENT_DESCRIPTION_DESCRIPTION,
    schema: SUGGEST_AGENT_DESCRIPTION_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting agent description",
      done: "Suggest agent description",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME,
    description: SUGGEST_AGENT_MODEL_CHANGE_DESCRIPTION,
    schema: SUGGEST_AGENT_MODEL_CHANGE_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting agent model change",
      done: "Suggest agent model change",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_AGENT_NAME_TOOL_NAME,
    description: SUGGEST_AGENT_NAME_DESCRIPTION,
    schema: SUGGEST_AGENT_NAME_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting agent name",
      done: "Suggest agent name",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME,
    description: SUGGEST_AGENT_PUBLISH_STATE_DESCRIPTION,
    schema: SUGGEST_AGENT_PUBLISH_STATE_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting agent publish state",
      done: "Suggest agent publish state",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME,
    description: SUGGEST_AGENT_INSTRUCTIONS_CHANGE_DESCRIPTION,
    schema: SUGGEST_AGENT_INSTRUCTIONS_CHANGE_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting agent instructions change",
      done: "Suggest agent instructions change",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME,
    description:
      "Suggest a new user-facing description for an existing custom Skill: the short text " +
      "members read when browsing skills.",
    schema: SUGGEST_SKILL_USER_FACING_DESCRIPTION_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting skill description",
      done: "Suggest skill description",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_SKILL_NAME_TOOL_NAME,
    description:
      "Suggest a new name for an existing custom Skill. The change is not applied directly: it " +
      "is recorded as a pending suggestion that the skill's editors can review, accept, or " +
      "reject. A name already carried by another active skill of the workspace is refused.",
    schema: SUGGEST_SKILL_NAME_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting skill name",
      done: "Suggest skill name",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: SUGGEST_SKILL_AVAILABILITY_TOOL_NAME,
    description:
      "Suggest who an existing custom Skill is available to: editors only, every member, or " +
      "members and agents. The change is not applied directly: it is recorded as a pending " +
      "suggestion that the skill's editors can review, accept, or reject. Changing availability " +
      "requires the workspace permission to publish skills.",
    schema: SUGGEST_SKILL_AVAILABILITY_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting skill availability",
      done: "Suggest skill availability",
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
      "Build and improve agents and skills from a conversation by proposing suggestions their editors can review.",
    authorization: null,
    icon: "ActionListCheckIcon",
    documentationUrl: null,
  },
  tools: BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
