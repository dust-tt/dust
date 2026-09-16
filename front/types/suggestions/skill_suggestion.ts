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

// - `reinforcement`: aggregated by the reinforcement workflow from synthetic suggestions.
// - `synthetic`: per-conversation intermediate suggestions consumed by reinforcement.
// - `conversational`: proposed by an agent during a conversation (building_agents_and_skills MCP).
export const SKILL_SUGGESTION_SOURCES = [
  "reinforcement",
  "synthetic",
  "conversational",
] as const;

export type SkillSuggestionSource = (typeof SKILL_SUGGESTION_SOURCES)[number];

export function isSkillSuggestionSource(
  value: unknown
): value is SkillSuggestionSource {
  return (
    typeof value === "string" &&
    SKILL_SUGGESTION_SOURCES.includes(value as SkillSuggestionSource)
  );
}

// Sources a user may review (accept/reject) in a product surface.
export const REVIEWABLE_SKILL_SUGGESTION_SOURCES = [
  "reinforcement",
  "conversational",
] as const satisfies readonly SkillSuggestionSource[];

export type ReviewableSkillSuggestionSource =
  (typeof REVIEWABLE_SKILL_SUGGESTION_SOURCES)[number];

export const SKILL_SUGGESTION_KINDS = ["edit", "editors"] as const;

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

export const SkillAgentFacingDescriptionEditSchema = z.object({
  content: z
    .string()
    .min(1)
    .describe(
      "The full new agent-facing description that will replace the current one."
    ),
});

export type SkillAgentFacingDescriptionEditType = z.infer<
  typeof SkillAgentFacingDescriptionEditSchema
>;

export const SkillEditSuggestionSchema = z
  .object({
    instructionEdits: z
      .array(SkillInstructionEditItemSchema)
      .optional()
      .describe("Block-targeted edits to the skill instructions."),
    agentFacingDescriptionEdit:
      SkillAgentFacingDescriptionEditSchema.optional().describe(
        "Replacement for the skill's agent-facing description."
      ),
  })
  .refine(
    (d) =>
      (d.instructionEdits && d.instructionEdits.length > 0) ||
      d.agentFacingDescriptionEdit !== undefined,
    "At least one of instructionEdits or agentFacingDescriptionEdit must be provided."
  );

export type SkillEditSuggestionType = z.infer<typeof SkillEditSuggestionSchema>;

export const SkillEditorsSuggestionSchema = z
  .object({
    addUserIds: z
      .array(z.string())
      .describe("sIds of the workspace members to add as editors."),
    removeUserIds: z
      .array(z.string())
      .describe("sIds of the current editors to remove."),
  })
  .refine(
    (d) => d.addUserIds.length > 0 || d.removeUserIds.length > 0,
    "At least one of addUserIds or removeUserIds must be non-empty."
  );

export type SkillEditorsSuggestionType = z.infer<
  typeof SkillEditorsSuggestionSchema
>;

export type SkillSuggestionPayload =
  | SkillEditSuggestionType
  | SkillEditorsSuggestionType;

const SkillEditSuggestionDataSchema = z.object({
  kind: z.literal("edit"),
  suggestion: SkillEditSuggestionSchema,
});

const SkillEditorsSuggestionDataSchema = z.object({
  kind: z.literal("editors"),
  suggestion: SkillEditorsSuggestionSchema,
});

const SkillSuggestionDataSchema = z.discriminatedUnion("kind", [
  SkillEditSuggestionDataSchema,
  SkillEditorsSuggestionDataSchema,
]);

type SkillSuggestionData = z.infer<typeof SkillSuggestionDataSchema>;

export function parseSkillSuggestionData(data: unknown): SkillSuggestionData {
  return SkillSuggestionDataSchema.parse(data);
}

export type SkillEditSuggestionData = Extract<
  SkillSuggestionData,
  { kind: "edit" }
>;

export type SkillEditorsSuggestionData = Extract<
  SkillSuggestionData,
  { kind: "editors" }
>;

// `kind` and `suggestion` are separate columns, so narrowing one without the other would lie about
// the payload. Applies to anything carrying the pair, the resource included.
function isSkillSuggestionOfKind<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
  K extends SkillSuggestionKind,
>(
  carrier: T,
  kind: K
): carrier is T & Extract<SkillSuggestionData, { kind: K }> {
  if (carrier.kind !== kind) {
    return false;
  }
  const { kind: parsedKind } = parseSkillSuggestionData({
    kind: carrier.kind,
    suggestion: carrier.suggestion,
  });

  return parsedKind === kind;
}

export function isEditSkillSuggestion<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
>(carrier: T): carrier is T & SkillEditSuggestionData {
  return isSkillSuggestionOfKind(carrier, "edit");
}

export function isEditorsSkillSuggestion<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
>(carrier: T): carrier is T & SkillEditorsSuggestionData {
  return isSkillSuggestionOfKind(carrier, "editors");
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
  visibleSourceConversationIds: z.array(z.string()),
  notificationConversationId: z.string().nullable(),
  updatedBy: SkillSuggestionUpdatedBySchema.nullable(),
});

export const SkillSuggestionSchema = BaseSkillSuggestionSchema.and(
  SkillSuggestionDataSchema
);

export type SkillSuggestionType = z.infer<typeof SkillSuggestionSchema>;
