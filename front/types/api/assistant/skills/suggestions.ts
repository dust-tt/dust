// Contract types and schemas for the skill suggestions endpoint
// (`/api/w/:wId/assistant/skills/:sId/suggestions`). Used by the skill
// suggestions route so validation has a single source of truth.
import { SkillWithoutInstructionsAndToolsSchema } from "@app/types/assistant/skill_configuration";
import { isString } from "@app/types/shared/utils/general";
import {
  SKILL_SUGGESTION_KINDS,
  SkillSuggestionSchema,
} from "@app/types/suggestions/skill_suggestion";
import { z } from "zod";

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

// Next.js serializes single query param values as string, multiple as array.
const stringOrArrayToArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (isString(v) ? [v] : v), z.array(schema));

export const GetSkillSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray(StateSchema).optional(),
  kind: z.enum(SKILL_SUGGESTION_KINDS).optional(),
  limit: z.string().optional(),
});

export type GetSkillSuggestionsQuery = z.infer<
  typeof GetSkillSuggestionsQuerySchema
>;

export const GetSkillSuggestionsResponseBodySchema = z.object({
  suggestions: z.array(SkillSuggestionSchema),
  // Active skills referenced by the instruction edits of `suggestions`, so that accepting an edit
  // can resolve them without fetching skills.
  referencedSkills: z.array(SkillWithoutInstructionsAndToolsSchema),
});
export type GetSkillSuggestionsResponseBody = z.infer<
  typeof GetSkillSuggestionsResponseBodySchema
>;

export const PatchSkillSuggestionRequestBodySchema = z.object({
  suggestionIds: z.array(z.string()).min(1),
  state: z.enum(["approved", "rejected", "outdated"]),
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
