import { GEMINI_FLASH_LITE_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Provider-wide input config: the widest reasoning contract any Gemini model
// accepts (`none` + all four native thinking levels). Per-model schemas narrow
// this further (e.g. Pro drops `none`/`minimal`).
export const googleAiStudioConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_FLASH_LITE_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
  cacheKey: z.undefined(),
  // Not required but strongly recommended by Google for Gemini 3
  temperature: temperatureSchema.optional().transform(() => 1 as const),
});

export type GoogleAiStudioInputConfig = z.infer<
  typeof googleAiStudioConfigSchema
>;
