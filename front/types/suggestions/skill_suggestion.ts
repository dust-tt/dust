import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import {
  SKILL_AVAILABILITIES,
  SKILL_NAME_MAX_LENGTH,
} from "@app/types/assistant/skill_configuration_constants";
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

export const SKILL_SUGGESTION_KINDS = [
  "edit",
  "editors",
  "user_facing_description",
  "create",
  "name",
  "delete",
  "availability",
] as const;

export type SkillSuggestionKind = (typeof SKILL_SUGGESTION_KINDS)[number];

// Kinds the reinforcement workflow produces (synthetic analysis) and consumes (aggregation).
// Reinforcement code MUST filter on these kinds when fetching suggestions so it never has to
// handle other kinds.
export const REINFORCEMENT_SKILL_SUGGESTION_KINDS = [
  "edit",
] as const satisfies readonly SkillSuggestionKind[];

export type ReinforcementSkillSuggestionKind =
  (typeof REINFORCEMENT_SKILL_SUGGESTION_KINDS)[number];

export function isReinforcementSkillSuggestionKind(
  kind: SkillSuggestionKind
): kind is ReinforcementSkillSuggestionKind {
  return REINFORCEMENT_SKILL_SUGGESTION_KINDS.includes(
    kind as ReinforcementSkillSuggestionKind
  );
}

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

export const SkillUserFacingDescriptionSuggestionSchema = z.object({
  userFacingDescription: z
    .string()
    .min(1)
    .max(USER_FACING_DESCRIPTION_MAX_LENGTH)
    .describe(
      "The full new user-facing description that will replace the current one."
    ),
});

export type SkillUserFacingDescriptionSuggestionType = z.infer<
  typeof SkillUserFacingDescriptionSuggestionSchema
>;

export const SkillCreateSuggestionSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .describe("The name the agent proposed for the new skill."),
});

export type SkillCreateSuggestionType = z.infer<
  typeof SkillCreateSuggestionSchema
>;

export const SkillNameSuggestionSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(SKILL_NAME_MAX_LENGTH)
    .describe("The full new name that will replace the current one."),
});

export type SkillNameSuggestionType = z.infer<typeof SkillNameSuggestionSchema>;

// No payload: the target skill is identified by `skillConfigurationId` on the carrier, and its
// name is looked up from the skill itself so it never goes stale.
export const SkillDeleteSuggestionSchema = z.object({});

export type SkillDeleteSuggestionType = z.infer<
  typeof SkillDeleteSuggestionSchema
>;

export const SkillAvailabilitySuggestionSchema = z.object({
  availability: z
    .enum(SKILL_AVAILABILITIES)
    .describe("Who the skill will be available to."),
});

export type SkillAvailabilitySuggestionType = z.infer<
  typeof SkillAvailabilitySuggestionSchema
>;

export type SkillSuggestionPayload =
  | SkillEditSuggestionType
  | SkillEditorsSuggestionType
  | SkillUserFacingDescriptionSuggestionType
  | SkillCreateSuggestionType
  | SkillNameSuggestionType
  | SkillDeleteSuggestionType
  | SkillAvailabilitySuggestionType;

const SkillEditSuggestionDataSchema = z.object({
  kind: z.literal("edit"),
  suggestion: SkillEditSuggestionSchema,
});

const SkillEditorsSuggestionDataSchema = z.object({
  kind: z.literal("editors"),
  suggestion: SkillEditorsSuggestionSchema,
});

const SkillUserFacingDescriptionSuggestionDataSchema = z.object({
  kind: z.literal("user_facing_description"),
  suggestion: SkillUserFacingDescriptionSuggestionSchema,
});

const SkillCreateSuggestionDataSchema = z.object({
  kind: z.literal("create"),
  suggestion: SkillCreateSuggestionSchema,
});

const SkillNameSuggestionDataSchema = z.object({
  kind: z.literal("name"),
  suggestion: SkillNameSuggestionSchema,
});

const SkillDeleteSuggestionDataSchema = z.object({
  kind: z.literal("delete"),
  suggestion: SkillDeleteSuggestionSchema,
});

const SkillAvailabilitySuggestionDataSchema = z.object({
  kind: z.literal("availability"),
  suggestion: SkillAvailabilitySuggestionSchema,
});

export const SkillSuggestionDataSchema = z.discriminatedUnion("kind", [
  SkillEditSuggestionDataSchema,
  SkillEditorsSuggestionDataSchema,
  SkillUserFacingDescriptionSuggestionDataSchema,
  SkillCreateSuggestionDataSchema,
  SkillNameSuggestionDataSchema,
  SkillDeleteSuggestionDataSchema,
  SkillAvailabilitySuggestionDataSchema,
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

export type SkillUserFacingDescriptionSuggestionData = Extract<
  SkillSuggestionData,
  { kind: "user_facing_description" }
>;

export type SkillCreateSuggestionData = Extract<
  SkillSuggestionData,
  { kind: "create" }
>;

export type SkillNameSuggestionData = Extract<
  SkillSuggestionData,
  { kind: "name" }
>;

export type SkillDeleteSuggestionData = Extract<
  SkillSuggestionData,
  { kind: "delete" }
>;

export type SkillAvailabilitySuggestionData = Extract<
  SkillSuggestionData,
  { kind: "availability" }
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

export function isUserFacingDescriptionSkillSuggestion<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
>(carrier: T): carrier is T & SkillUserFacingDescriptionSuggestionData {
  return isSkillSuggestionOfKind(carrier, "user_facing_description");
}

export function isCreateSkillSuggestion<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
>(carrier: T): carrier is T & SkillCreateSuggestionData {
  return isSkillSuggestionOfKind(carrier, "create");
}

export function isNameSkillSuggestion<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
>(carrier: T): carrier is T & SkillNameSuggestionData {
  return isSkillSuggestionOfKind(carrier, "name");
}

export function isDeleteSkillSuggestion<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
>(carrier: T): carrier is T & SkillDeleteSuggestionData {
  return isSkillSuggestionOfKind(carrier, "delete");
}

export function isAvailabilitySkillSuggestion<
  T extends { kind: SkillSuggestionKind; suggestion: unknown },
>(carrier: T): carrier is T & SkillAvailabilitySuggestionData {
  return isSkillSuggestionOfKind(carrier, "availability");
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

export type ReinforcementSkillSuggestionType = Extract<
  SkillSuggestionType,
  { kind: ReinforcementSkillSuggestionKind }
>;

export function isReinforcementSkillSuggestion(
  suggestion: SkillSuggestionType
): suggestion is ReinforcementSkillSuggestionType {
  return isReinforcementSkillSuggestionKind(suggestion.kind);
}
