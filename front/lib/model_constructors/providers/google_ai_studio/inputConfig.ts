import { GEMINI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { z } from "zod";

// Provider-wide input config: the widest reasoning contract any Gemini model
// accepts (all four native thinking levels). Per-model schemas narrow this
// further (e.g. Pro drops `minimal`).
export const googleAiStudioConfigSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_SUPPORTED_REASONING_EFFORTS),
    })
    .optional(),
});

export type GoogleAiStudioInputConfig = z.infer<
  typeof googleAiStudioConfigSchema
>;
