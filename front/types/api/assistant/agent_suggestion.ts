import { isString } from "@app/types/shared/utils/general";
import {
  AGENT_SUGGESTION_SOURCES,
  AgentSuggestionSchema,
} from "@app/types/suggestions/agent_suggestion";
import { z } from "zod";

export const PatchSuggestionRequestBodySchema = z.object({
  suggestionIds: z.array(z.string()).min(1),
  state: z.enum(["approved", "rejected", "outdated"]),
  applyToAgent: z.boolean().optional(),
});

export type PatchSuggestionRequestBody = z.infer<
  typeof PatchSuggestionRequestBodySchema
>;

export const PatchSuggestionResponseBodySchema = z.object({
  suggestions: z.array(AgentSuggestionSchema),
});
export type PatchSuggestionResponseBody = z.infer<
  typeof PatchSuggestionResponseBodySchema
>;

const StateSchema = z.enum(["pending", "approved", "rejected", "outdated"]);

// Next.js serializes single query param values as string, multiple as array.
const stringOrArrayToArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (isString(v) ? [v] : v), z.array(schema));

export const GetSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray(StateSchema).optional(),
  kind: z.enum(["instructions", "tools", "skills", "model"]).optional(),
  sources: stringOrArrayToArray(z.enum(AGENT_SUGGESTION_SOURCES)).optional(),
  limit: z.string().optional(),
});

export type GetSuggestionsQuery = z.infer<typeof GetSuggestionsQuerySchema>;

export const GetSuggestionsResponseBodySchema = z.object({
  suggestions: z.array(AgentSuggestionSchema),
});
export type GetSuggestionsResponseBody = z.infer<
  typeof GetSuggestionsResponseBodySchema
>;
