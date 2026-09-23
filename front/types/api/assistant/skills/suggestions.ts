// Contract types and schemas for the skill suggestions endpoint
// (`/api/w/:wId/assistant/skills/:sId/suggestions`). Used by the skill
// suggestions route so validation has a single source of truth.
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { isString } from "@app/types/shared/utils/general";
import {
  REVIEWABLE_SKILL_SUGGESTION_SOURCES,
  SKILL_SUGGESTION_KINDS,
  SkillSuggestionSchema,
} from "@app/types/suggestions/skill_suggestion";
import { z } from "zod";

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);
const SourceSchema = z.enum(REVIEWABLE_SKILL_SUGGESTION_SOURCES);

// Next.js serializes single query param values as string, multiple as array.
const stringOrArrayToArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (isString(v) ? [v] : v), z.array(schema));

export const GetSkillSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray(StateSchema).optional(),
  sources: stringOrArrayToArray(SourceSchema).optional(),
  kind: z.enum(SKILL_SUGGESTION_KINDS).optional(),
  limit: z.string().optional(),
});

export type GetSkillSuggestionsQuery = z.infer<
  typeof GetSkillSuggestionsQuerySchema
>;

export const GetSkillSuggestionsResponseBodySchema = z.object({
  suggestions: z.array(SkillSuggestionSchema),
});
export type GetSkillSuggestionsResponseBody = z.infer<
  typeof GetSkillSuggestionsResponseBodySchema
>;

export const PatchSkillSuggestionRequestBodySchema = z.object({
  suggestionIds: z.array(z.string()).min(1),
  state: z.enum(["approved", "rejected", "outdated"]),
  applyToSkill: z.boolean().optional(),
});

export type PatchSkillSuggestionRequestBody = z.infer<
  typeof PatchSkillSuggestionRequestBodySchema
>;

export const PatchSkillSuggestionResponseBodySchema = z.object({
  suggestions: z.array(SkillSuggestionSchema),
});
export type PatchSkillSuggestionResponseBody = z.infer<
  typeof PatchSkillSuggestionResponseBodySchema
>;

export const GetSkillSuggestionsPreviewQuerySchema = z.object({
  suggestionIds: z
    .string()
    .min(1)
    .transform((ids) => ids.split(",")),
});

export const SkillSuggestionsPreviewSchema = z.object({
  name: z.string().optional(),
  availability: z.enum(SKILL_AVAILABILITIES).optional(),
  agentFacingDescription: z.string().optional(),
  userFacingDescription: z.string().optional(),
  instructions: z.string().optional(),
  instructionsHtml: z.string().optional(),
});
export type SkillSuggestionsPreviewType = z.infer<
  typeof SkillSuggestionsPreviewSchema
>;

export const GetSkillSuggestionsPreviewResponseBodySchema = z.object({
  preview: SkillSuggestionsPreviewSchema,
});
export type GetSkillSuggestionsPreviewResponseBody = z.infer<
  typeof GetSkillSuggestionsPreviewResponseBodySchema
>;
