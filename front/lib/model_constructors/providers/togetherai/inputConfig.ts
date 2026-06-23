import {
  inputConfigSchema,
  reasoningSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Schema for the non-reasoning TogetherAI models we serve (Llama 3.3 70B Turbo,
// Qwen2 72B Instruct): accept any reasoning effort but always drop it, so the
// request never carries a `reasoning_effort` — matching the legacy client, which
// forces the effort to `none`. The parsed output keeps `none` so the Dust layer
// can read it as `defaultReasoningEffort`. Temperature passes through unchanged.
// TogetherAI has no explicit prompt-cache key.
export const togetheraiNonReasoningConfigSchema = inputConfigSchema.extend({
  reasoning: reasoningSchema
    .optional()
    .transform((r): { effort: "none" } | undefined =>
      r ? { effort: "none" } : undefined
    ),
  cacheKey: z.undefined(),
});

export type TogetheraiInputConfig = z.infer<
  typeof togetheraiNonReasoningConfigSchema
>;
