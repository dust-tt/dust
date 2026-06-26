import { AgentSuggestionSchema } from "@app/types/suggestions/agent_suggestion";
import { z } from "zod";

export const PatchSuggestionRequestBodySchema = z.object({
  suggestionIds: z.array(z.string()).min(1),
  state: z.enum(["approved", "rejected", "outdated"]),
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
const stringOrArrayToArray = z.preprocess(
  (v) => (typeof v === "string" ? [v] : v),
  z.array(StateSchema)
);

export const GetSuggestionsQuerySchema = z.object({
  states: stringOrArrayToArray.optional(),
  kind: z.enum(["instructions", "tools", "skills", "model"]).optional(),
  limit: z.string().optional(),
});

export type GetSuggestionsQuery = z.infer<typeof GetSuggestionsQuerySchema>;

export const GetSuggestionsResponseBodySchema = z.object({
  suggestions: z.array(AgentSuggestionSchema),
});
export type GetSuggestionsResponseBody = z.infer<
  typeof GetSuggestionsResponseBodySchema
>;
