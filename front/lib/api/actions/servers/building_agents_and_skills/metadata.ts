import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SUGGESTION_REF_REGEX } from "@app/lib/skills/format";
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
import { MAX_TAGS_PER_CHANGE } from "@app/types/tag";
import { z } from "zod";

export const BUILDING_AGENTS_AND_SKILLS_SERVER_NAME =
  "building_agents_and_skills" as const;

export const DESCRIBE_SKILL_TOOL_NAME = "describe_skill" as const;
export const DESCRIBE_AGENT_TOOL_NAME = "describe_agent" as const;
export const SUGGEST_TOOL_NAME = "suggest" as const;

// Bounds the O(n²) pairwise conflict check in hasSuggestionSelfConflict; larger rewrites
// should target the instructions root block instead.
const MAX_INSTRUCTION_EDITS = 50;

export const CreateAgentSuggestionSchema = z.object({
  kind: z.literal("create_agent"),
  ref: z
    .string()
    .regex(SUGGESTION_REF_REGEX)
    .optional()
    .describe(
      "A temporary name for the new agent, unique among the agents created in this call. Use it " +
        "anywhere in the same call, in place of the id of this agent, which does not exist yet."
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .describe(
      "Unique, human-readable agent name, without a leading '@' and without spaces"
    ),
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
  toolIds: z
    .array(z.string())
    .optional()
    .describe(
      "Ids of the tools to give the agent. Only tools that need no configuration (no " +
        "knowledge, sub-agent or settings to pick) can be added."
    ),
  skillIds: z
    .array(z.string())
    .optional()
    .describe("Ids of the active skills to give the agent."),
  skillRefs: z
    .array(z.string().regex(SUGGESTION_REF_REGEX))
    .optional()
    .describe(
      "Temporary names of skills created in this call, to give the agent."
    ),
  subAgentIds: z
    .array(z.string())
    .optional()
    .describe(
      "Ids of the active agents to give the agent as sub-agents, which it can run to delegate a " +
        "task."
    ),
  subAgentRefs: z
    .array(z.string().regex(SUGGESTION_REF_REGEX))
    .optional()
    .describe(
      "Temporary names of agents created in this call, to give the agent as sub-agents."
    ),
});

export type CreateAgentSuggestion = z.infer<typeof CreateAgentSuggestionSchema>;

export const CreateSkillSuggestionSchema = z.object({
  kind: z.literal("create_skill"),
  ref: z
    .string()
    .regex(SUGGESTION_REF_REGEX)
    .optional()
    .describe(
      "A temporary name for the new skill, unique among the skills created in this call. Use it " +
        "anywhere in the same call, in place of the id of this skill, which does not exist yet."
    ),
  name: z
    .string()
    .trim()
    .min(1)
    .max(SKILL_NAME_MAX_LENGTH)
    .describe(
      `Unique skill name, at most ${SKILL_NAME_MAX_LENGTH} characters.`
    ),
  userFacingDescription: z
    .string()
    .min(1)
    .max(USER_FACING_DESCRIPTION_MAX_LENGTH)
    .describe(
      "The short text members read when browsing skills, at most " +
        `${USER_FACING_DESCRIPTION_MAX_LENGTH} characters.`
    ),
  agentFacingDescription: z
    .string()
    .min(1)
    .max(AGENT_FACING_DESCRIPTION_MAX_LENGTH)
    .describe(
      "The description agents read to decide when to use the skill, at most " +
        `${AGENT_FACING_DESCRIPTION_MAX_LENGTH} characters.`
    ),
  instructions: z
    .string()
    .trim()
    .min(1)
    .describe(
      "The skill's instructions, as HTML. Cite a skill created in the same call as " +
        '<skill ref="name"/>.'
    ),
});

export type CreateSkillSuggestion = z.infer<typeof CreateSkillSuggestionSchema>;

export const EditAgentSuggestionSchema = z.object({
  kind: z.literal("edit_agent"),
  agentId: z.string().describe("The id of the agent to edit."),
  name: z
    .string()
    .min(1)
    .optional()
    .describe("The new name, without a leading '@' and without spaces"),
  description: z.string().min(1).optional().describe("The new description."),
  instructionEdits: z
    .array(SkillInstructionEditItemSchema)
    .max(MAX_INSTRUCTION_EDITS)
    .optional()
    .describe(
      "Block-targeted edits to the agent's instructions. Each item targets one block by its " +
        `data-block-id (at most ${MAX_INSTRUCTION_EDITS} edits). Use ` +
        `"${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" as targetBlockId for a full rewrite.`
    ),
  modelId: ModelIdSchema.optional().describe(
    "The id of the new model for the agent."
  ),
  reasoningEffort: z
    .enum(ORDERED_REASONING_EFFORTS)
    .optional()
    .describe(
      "The reasoning effort to use with the model, if the model supports more than one."
    ),
  scope: z
    .enum(["hidden", "visible"])
    .optional()
    .describe(
      "The new publish state: 'visible' to publish the agent (visible to the " +
        "whole workspace), 'hidden' to unpublish it (visible to editors only)."
    ),
  structuredOutput: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe(
      "The JSON schema the agent's answers must follow, as a JSON string " +
        '`{"type":"json_schema","json_schema":{"name":...,"schema":{...}}}`, replacing the ' +
        "current one. `null` removes the structured output."
    ),
  skills: z
    .object({
      addSkillIds: z
        .array(z.string())
        .optional()
        .describe("Ids of the active skills to add to the agent."),
      addSkillRefs: z
        .array(z.string().regex(SUGGESTION_REF_REGEX))
        .optional()
        .describe(
          "Temporary names of skills created in this call, to add to the agent."
        ),
      removeSkillIds: z
        .array(z.string())
        .optional()
        .describe("Ids of the agent's skills to remove from it."),
    })
    .optional()
    .describe("The skills to add to or remove from the agent."),
  tools: z
    .object({
      addToolIds: z
        .array(z.string())
        .optional()
        .describe(
          "Ids of the tools to add to the agent. Only tools that need no configuration (no " +
            "knowledge or settings to pick) can be added; add sub-agents with `subAgents`."
        ),
      removeToolIds: z
        .array(z.string())
        .optional()
        .describe("Ids of the agent's tools to remove from it."),
    })
    .optional()
    .describe("The tools to add to or remove from the agent."),
  subAgents: z
    .object({
      addAgentIds: z
        .array(z.string())
        .optional()
        .describe(
          "Ids of the active agents to add as sub-agents, which the agent can run to delegate " +
            "a task."
        ),
      addAgentRefs: z
        .array(z.string().regex(SUGGESTION_REF_REGEX))
        .optional()
        .describe(
          "Temporary names of agents created in this call, to add as sub-agents."
        ),
      removeAgentIds: z
        .array(z.string())
        .optional()
        .describe("Ids of the agent's sub-agents to remove from it."),
    })
    .optional()
    .describe("The sub-agents to add to or remove from the agent."),
  editors: z
    .object({
      addUserIds: z
        .array(z.string())
        .optional()
        .describe("Ids of the workspace members to add as editors."),
      removeUserIds: z
        .array(z.string())
        .optional()
        .describe("Ids of the agent's editors to remove."),
    })
    .optional()
    .describe("The editors to add to or remove from the agent."),
  tags: z
    .object({
      addTags: z
        .array(z.string())
        .max(MAX_TAGS_PER_CHANGE)
        .optional()
        .describe(
          "Names of the tags to add to the agent. A tag that does not exist yet is created " +
            "when the suggestion is accepted, which only workspace admins can do."
        ),
      removeTags: z
        .array(z.string())
        .max(MAX_TAGS_PER_CHANGE)
        .optional()
        .describe("Names of the agent's tags to remove from it."),
    })
    .optional()
    .describe("The tags to add to or remove from the agent."),
});

export type EditAgentSuggestion = z.infer<typeof EditAgentSuggestionSchema>;

export const EditSkillSuggestionSchema = z.object({
  kind: z.literal("edit_skill"),
  skillId: z.string().describe("The id of the custom skill to edit."),
  name: z
    .string()
    .min(1)
    .max(SKILL_NAME_MAX_LENGTH)
    .optional()
    .describe(
      `The new name, at most ${SKILL_NAME_MAX_LENGTH} characters. It must be unique among ` +
        "the workspace's active skills."
    ),
  userFacingDescription: z
    .string()
    .min(1)
    .max(USER_FACING_DESCRIPTION_MAX_LENGTH)
    .optional()
    .describe(
      "The full new user-facing description (replaces the current one), at most " +
        `${USER_FACING_DESCRIPTION_MAX_LENGTH} characters.`
    ),
  agentFacingDescription: z
    .string()
    .min(1)
    .max(AGENT_FACING_DESCRIPTION_MAX_LENGTH)
    .optional()
    .describe(
      "The full new agent-facing description (replaces the current one), at most " +
        `${AGENT_FACING_DESCRIPTION_MAX_LENGTH} characters.`
    ),
  instructionEdits: z
    .array(SkillInstructionEditItemSchema)
    .max(MAX_INSTRUCTION_EDITS)
    .optional()
    .describe(
      "Block-targeted edits to the skill instructions. Each item targets one block by its " +
        `data-block-id (at most ${MAX_INSTRUCTION_EDITS} edits). Use ` +
        `"${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" as targetBlockId for a full rewrite. ` +
        'Cite a skill created in the same call as <skill ref="name"/>.'
    ),
  availability: z
    .enum(SKILL_AVAILABILITIES)
    .optional()
    .describe(
      "Who the skill will be available to: `editors` (unpublished, editors only), " +
        "`workspace_users` (every member can find and use it), or `users_and_agents` " +
        "(members and agents, which may pick it on their own)."
    ),
  addEditorUserIds: z
    .array(z.string())
    .optional()
    .describe("Ids of the workspace members to add as editors of the skill."),
  removeEditorUserIds: z
    .array(z.string())
    .optional()
    .describe("Ids of the current editors to remove from the skill."),
  removeFileIds: z
    .array(z.string())
    .optional()
    .describe(`Ids of the files to remove from the skill.`),
});

export type EditSkillSuggestion = z.infer<typeof EditSkillSuggestionSchema>;

export const DeleteAgentSuggestionSchema = z.object({
  kind: z.literal("delete_agent"),
  agentId: z.string().describe("The id of the agent to delete."),
});

export type DeleteAgentSuggestion = z.infer<typeof DeleteAgentSuggestionSchema>;

export const DeleteSkillSuggestionSchema = z.object({
  kind: z.literal("delete_skill"),
  skillId: z.string().describe("The id of the custom skill to delete."),
});

export type DeleteSkillSuggestion = z.infer<typeof DeleteSkillSuggestionSchema>;

export const SuggestionSchema = z.discriminatedUnion("kind", [
  CreateAgentSuggestionSchema,
  CreateSkillSuggestionSchema,
  EditAgentSuggestionSchema,
  EditSkillSuggestionSchema,
  DeleteAgentSuggestionSchema,
  DeleteSkillSuggestionSchema,
]);

export type Suggestion = z.infer<typeof SuggestionSchema>;

export const SUGGEST_DESCRIPTION =
  "Suggest one or more changes to the agents and skills of this workspace: create, edit, or " +
  "delete agents and skills. The changes are not applied directly: they are recorded as " +
  "pending suggestions that editors can review, accept, or reject.";

// Bounded by the `batch_suggestions.analysis` column.
const BATCH_SUGGESTION_ANALYSIS_MAX_LENGTH = 255;

export const SUGGEST_INPUT_SCHEMA = z.object({
  title: z
    .string()
    .max(25)
    .describe(
      "A short, action-oriented user-facing title for these suggestions (at most 25 characters)."
    ),
  analysis: z
    .string()
    .max(BATCH_SUGGESTION_ANALYSIS_MAX_LENGTH)
    .describe(
      `Why these changes are needed (at most ${BATCH_SUGGESTION_ANALYSIS_MAX_LENGTH} characters).`
    ),
  suggestions: z
    .array(SuggestionSchema)
    .min(1)
    .describe("The changes to suggest, discriminated by `kind`."),
});

export type SuggestArgs = z.infer<typeof SUGGEST_INPUT_SCHEMA>;

export const BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA = [
  {
    name: DESCRIBE_SKILL_TOOL_NAME,
    description:
      "Get a custom Skill's name, availability, self-improvement mode, user-facing and " +
      "agent-facing descriptions, editors, attached files, and instructions as HTML whose " +
      "blocks carry a data-block-id.",
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
    name: SUGGEST_TOOL_NAME,
    description: SUGGEST_DESCRIPTION,
    schema: SUGGEST_INPUT_SCHEMA.shape,
    stake: "never_ask",
    displayLabels: {
      running: "Suggesting changes",
      done: "Suggest changes",
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
