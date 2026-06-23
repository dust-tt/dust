import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Schema for the non-reasoning TogetherAI models we serve (Llama 3.3 70B Turbo,
// Qwen2 72B Instruct): accept only `none`, so every other effort is rejected.
// The converter maps `none` to no `reasoning_effort`, so the request never
// carries one. `none` is kept (not transformed away) so the Dust layer can
// still read it as `defaultReasoningEffort`. Temperature passes through
// unchanged. TogetherAI has no explicit prompt-cache key.
export const togetheraiNonReasoningConfigSchema = inputConfigSchema.extend({
  reasoning: z.object({ effort: z.literal("none") }).optional(),
  cacheKey: z.undefined(),
});

export type TogetheraiInputConfig = z.infer<
  typeof togetheraiNonReasoningConfigSchema
>;
