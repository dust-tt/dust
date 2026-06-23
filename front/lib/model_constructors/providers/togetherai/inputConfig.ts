import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Schema for the non-reasoning TogetherAI models we serve (Llama 3.3 70B Turbo,
// Qwen2 72B Instruct): accept `none` but drop it so the request omits
// `reasoning_effort` (the API rejects it on these models). Temperature passes
// through unchanged. TogetherAI has no explicit prompt-cache key.
export const togetheraiNonReasoningConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.literal("none") })
    .optional()
    .transform(() => undefined),
  cacheKey: z.undefined(),
});

export type TogetheraiInputConfig = z.infer<
  typeof togetheraiNonReasoningConfigSchema
>;
