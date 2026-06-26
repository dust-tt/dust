import { MISTRAL_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/mistral/reasoning_efforts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Widest Mistral reasoning contract (off/on). Per-model schemas narrow it:
// Large is non-reasoning and drops the effort before it reaches the request.
export const mistralConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([...MISTRAL_SUPPORTED_REASONING_EFFORTS]),
    })
    .optional(),
  // Mistral has no explicit prompt-cache key.
  cacheKey: z.undefined(),
});

export type MistralInputConfig = z.infer<typeof mistralConfigSchema>;

// Schema for non-reasoning Mistral models (Large, Small): accept `none` but drop
// it so the request omits `reasoning_effort` (the API rejects it on these
// models). Temperature passes through unchanged.
export const mistralNonReasoningConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.literal("none") })
    .optional()
    .transform(() => undefined),
  cacheKey: z.undefined(),
});
