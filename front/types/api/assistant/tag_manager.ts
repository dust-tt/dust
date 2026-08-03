import { z } from "zod";

const GetSuggestionsResponseBodySchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string(),
        agents: z.array(z.object({ sId: z.string(), name: z.string() })),
      })
    )
    .nullish(),
});

export type GetSuggestionsResponseBody = z.infer<
  typeof GetSuggestionsResponseBodySchema
>;
