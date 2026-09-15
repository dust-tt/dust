import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { SkillInstructionEditItemSchema } from "@app/types/suggestions/skill_suggestion";
import { z } from "zod";

export const BUILDING_AGENTS_AND_SKILLS_SERVER_NAME =
  "building_agents_and_skills" as const;

export const SUGGEST_SKILL_UPDATE_TOOL_NAME = "suggest_skill_update" as const;

export const SUGGEST_SKILL_UPDATE_INPUT_SCHEMA = z.object({
  skillId: z.string().describe("The id of the custom skill to update."),
  instructionEdits: z
    .array(SkillInstructionEditItemSchema)
    .optional()
    .describe(
      "Block-targeted edits to the skill instructions. Each item targets one block by its " +
        `data-block-id. Use "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" as targetBlockId for a full rewrite.`
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

export const BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA = [
  {
    name: SUGGEST_SKILL_UPDATE_TOOL_NAME,
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
