import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Blackfuel validates `reasoning_effort` per model against the
// `reasoning.supported_efforts` listed by `GET /v1/models`, so per-model
// schemas narrow this widest set:
// https://docs.blackfuel.ai/docs/guides/reasoning (2026-10-05).
export const blackfuelConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([
        "none",
        "minimal",
        "low",
        "medium",
        "high",
        "xhigh",
        "maximal",
      ]),
    })
    .optional(),
  // Blackfuel has no hosted tool search and no explicit prompt-cache key.
  toolSearchEnabled: z.literal(false).optional(),
  cacheKey: z.undefined(),
});

export type BlackfuelInputConfig = z.infer<typeof blackfuelConfigSchema>;
