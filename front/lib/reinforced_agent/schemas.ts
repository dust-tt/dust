import { z } from "zod";

const ReinforcedSuggestionSchema = z.object({
  kind: z.string(),
  content: z.string(),
  targetBlockId: z.string(),
  analysis: z.string(),
});

export const ReinforcedResponseSchema = z.object({
  suggestions: z.array(ReinforcedSuggestionSchema),
});
