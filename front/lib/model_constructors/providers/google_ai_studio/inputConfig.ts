import { GEMINI_THINKING_OFF_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { geminiTemperatureSchema } from "@app/lib/model_constructors/providers/google_ai_studio/temperature";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Provider-wide input config: the widest reasoning contract any Gemini model
// accepts (`none` + all four native thinking levels). Per-model schemas narrow
// this further (e.g. Pro drops `none`/`minimal`).
export const googleAiStudioConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_THINKING_OFF_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
  cacheKey: z.undefined(),
  // Gemini accepts the full 0..2 range in every thinking mode (verified live).
  // Google recommends 1 for Gemini 3, but that is a recommendation, not a
  // constraint: the coercion to 1 is applied by the llms layer via the
  // `forceTemperatureToOne` config parser, so this schema mirrors the API.
  temperature: geminiTemperatureSchema.optional(),
});

export type GoogleAiStudioInputConfig = z.infer<
  typeof googleAiStudioConfigSchema
>;
