// Contract types and schemas for the skill suggestions endpoint
// (`/api/w/:wId/assistant/skills/:sId/suggestions`). Used by the skill
// suggestions route so validation has a single source of truth.
import { SkillSuggestionSchema } from "@app/types/suggestions/skill_suggestion";
import { z } from "zod";

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

// Next.js serializes single query param values as string, multiple as array.
const stringOrArrayToArray = z.preprocess(
  (v) => (typeof v === "string" ? [v] : v),
  z.array(StateSchema)
);

export const GetSkillSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray.optional(),
  kind: z.enum(["edit"]).optional(),
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
