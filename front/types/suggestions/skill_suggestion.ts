import { z } from "zod";

export const SKILL_SUGGESTION_STATES = [
  "pending",
  "approved",
  "rejected",
  "outdated",
] as const;

export type SkillSuggestionState = (typeof SKILL_SUGGESTION_STATES)[number];

export const SKILL_SUGGESTION_SOURCES = ["reinforcement", "synthetic"] as const;

export type SkillSuggestionSource = (typeof SKILL_SUGGESTION_SOURCES)[number];

export const SKILL_SUGGESTION_KINDS = ["create", "edit_instructions"] as const;

export type SkillSuggestionKind = (typeof SKILL_SUGGESTION_KINDS)[number];

export const SkillCreateSuggestionSchema = z.object({}).strict();

export type SkillCreateSuggestionType = z.infer<
  typeof SkillCreateSuggestionSchema
>;

export function isSkillCreateSuggestion(
  data: unknown
): data is SkillCreateSuggestionType {
  return SkillCreateSuggestionSchema.safeParse(data).success;
}

export const SkillEditInstructionsSuggestionSchema = z.object({
  instructions: z
    .string()
    .describe("Full replacement text for the skill instructions."),
});

export type SkillEditInstructionsSuggestionType = z.infer<
  typeof SkillEditInstructionsSuggestionSchema
>;

export function isSkillEditInstructionsSuggestion(
  data: unknown
): data is SkillEditInstructionsSuggestionType {
  return SkillEditInstructionsSuggestionSchema.safeParse(data).success;
}

export type SkillSuggestionPayload =
  | SkillCreateSuggestionType
  | SkillEditInstructionsSuggestionType;

export const SkillSuggestionDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    suggestion: SkillCreateSuggestionSchema,
  }),
  z.object({
    kind: z.literal("edit_instructions"),
    suggestion: SkillEditInstructionsSuggestionSchema,
  }),
]);

export type SkillSuggestionData = z.infer<typeof SkillSuggestionDataSchema>;

export function parseSkillSuggestionData(data: unknown): SkillSuggestionData {
  return SkillSuggestionDataSchema.parse(data);
}

const BaseSkillSuggestionSchema = z.object({
  sId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  skillConfigurationId: z.string(),
  analysis: z.string().nullable(),
  state: z.enum(SKILL_SUGGESTION_STATES),
  source: z.enum(SKILL_SUGGESTION_SOURCES),
  sourceConversationId: z.string().nullable(),
});

export const SkillSuggestionSchema =
  BaseSkillSuggestionSchema.and(SkillSuggestionDataSchema);

export type SkillSuggestionType = z.infer<typeof SkillSuggestionSchema>;
