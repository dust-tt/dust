import { MISTRAL_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/mistral/reasoning_efforts";
import { mistralTemperatureSchema } from "@app/lib/model_constructors/providers/mistral/temperature";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Characterized against the live API (2026-07-27) by running the endpoint
// suites with the widest `inputConfigSchema`.
//
// Mistral splits cleanly in two: Large and Codestral answer any
// `reasoning_effort` with "reasoning_effort is not enabled for this model",
// while Medium 3.5 and Small accept exactly `none` and `high` ("... is not
// supported for this model, supported values: [high, none]" for anything else).
// `temperature` is a real knob on every model, in 0..1.5.

// Widest Mistral reasoning contract (off/on), for the models that have it.
export const mistralConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([...MISTRAL_SUPPORTED_REASONING_EFFORTS]),
    })
    .optional(),
  // Mistral has no explicit prompt-cache key.
  cacheKey: z.undefined(),
  temperature: mistralTemperatureSchema.optional(),
});

export type MistralInputConfig = z.infer<typeof mistralConfigSchema>;

// Schema for the genuinely non-reasoning Mistral models (Large, Codestral): the
// API rejects `reasoning_effort` outright, so reasoning must be undefined. The
// Dust layer drops it via `dropReasoning` before validation.
export const mistralNonReasoningConfigSchema = inputConfigSchema.extend({
  reasoning: z.undefined(),
  cacheKey: z.undefined(),
  temperature: mistralTemperatureSchema.optional(),
});
