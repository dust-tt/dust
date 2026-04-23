import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { z } from "zod";

export const SKILL_SUGGESTION_STATES = [
  "pending",
  "approved",
  "rejected",
  "outdated",
] as const;

export type SkillSuggestionState = (typeof SKILL_SUGGESTION_STATES)[number];

export function isSkillSuggestionState(
  value: unknown
): value is SkillSuggestionState {
  return (
    typeof value === "string" &&
    SKILL_SUGGESTION_STATES.includes(value as SkillSuggestionState)
  );
}

export const SKILL_SUGGESTION_SOURCES = ["reinforcement", "synthetic"] as const;

export type SkillSuggestionSource = (typeof SKILL_SUGGESTION_SOURCES)[number];

export function isSkillSuggestionSource(
  value: unknown
): value is SkillSuggestionSource {
  return (
    typeof value === "string" &&
    SKILL_SUGGESTION_SOURCES.includes(value as SkillSuggestionSource)
  );
}

export const SKILL_SUGGESTION_KINDS = ["edit"] as const;

export type SkillSuggestionKind = (typeof SKILL_SUGGESTION_KINDS)[number];

export const SkillInstructionEditItemSchema = z.object({
  targetBlockId: z
    .string()
    .describe(
      `The data-block-id of the block to replace. Use "${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}" for full rewrites.`
    ),
  content: z
    .string()
    .describe(
      "The full content to replace the block with, including the wrapping tag. Must be a single-line string."
    ),
  type: z.literal("replace").describe("The type of modification to perform."),
});

export type SkillInstructionEditItemType = z.infer<
  typeof SkillInstructionEditItemSchema
>;

export const SkillToolEditItemSchema = z.object({
  action: z.enum(["add", "remove"]),
  toolId: z.string(),
});

export type SkillToolEditItemType = z.infer<typeof SkillToolEditItemSchema>;

export const SkillEditSuggestionSchema = z
  .object({
    instructionEdits: z
      .array(SkillInstructionEditItemSchema)
      .optional()
      .describe("Block-targeted edits to the skill instructions."),
    toolEdits: z
      .array(SkillToolEditItemSchema)
      .optional()
      .describe("Tools to add or remove from the skill."),
  })
  .refine(
    (d) =>
      (d.instructionEdits && d.instructionEdits.length > 0) ||
      (d.toolEdits && d.toolEdits.length > 0),
    "At least one of instructionEdits or toolEdits must be provided."
  );

export type SkillEditSuggestionType = z.infer<typeof SkillEditSuggestionSchema>;

export function isSkillEditSuggestion(
  data: unknown
): data is SkillEditSuggestionType {
  return SkillEditSuggestionSchema.safeParse(data).success;
}

export type SkillSuggestionPayload = SkillEditSuggestionType;

export const SkillSuggestionDataSchema = z.object({
  kind: z.literal("edit"),
  suggestion: SkillEditSuggestionSchema,
});

export type SkillSuggestionData = z.infer<typeof SkillSuggestionDataSchema>;

export function parseSkillSuggestionData(data: unknown): SkillSuggestionData {
  return SkillSuggestionDataSchema.parse(data);
}

const SkillSuggestionUpdatedBySchema = z.object({
  sId: z.string(),
  fullName: z.string(),
  email: z.string(),
});

export type SkillSuggestionUpdatedBy = z.infer<
  typeof SkillSuggestionUpdatedBySchema
>;

const BaseSkillSuggestionSchema = z.object({
  sId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  skillConfigurationId: z.string(),
  analysis: z.string().nullable(),
  title: z.string().nullable(),
  state: z.enum(SKILL_SUGGESTION_STATES),
  source: z.enum(SKILL_SUGGESTION_SOURCES),
  sourceConversationsCount: z.number(),
  updatedBy: SkillSuggestionUpdatedBySchema.nullable(),
});

export const SkillSuggestionSchema = BaseSkillSuggestionSchema.and(
  SkillSuggestionDataSchema
);

export type SkillSuggestionType = z.infer<typeof SkillSuggestionSchema>;
