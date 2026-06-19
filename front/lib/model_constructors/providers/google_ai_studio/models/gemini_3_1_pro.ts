import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import {
  GEMINI_3_CONTEXT_SIZE,
  GEMINI_3_MAX_OUTPUT_TOKENS,
} from "@app/lib/model_constructors/providers/google_ai_studio/models/shared";
import { GEMINI_PRO_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { GEMINI_3_1_PRO_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

const DEFAULT_REASONING_EFFORT = "high";

// Pro supports the low/medium/high thinking levels (no `minimal`) and strongly
// recommends `temperature: 1`, so we coerce temperature to 1.
const configSchema = googleAiStudioConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_PRO_SUPPORTED_REASONING_EFFORTS),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithGoogleAiStudioGeminiThreeDotOneProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleAiStudioGeminiThreeDotOnePro extends Base {
    static readonly modelId = GEMINI_3_1_PRO_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = GEMINI_3_CONTEXT_SIZE;
    static readonly maxOutputTokens = GEMINI_3_MAX_OUTPUT_TOKENS;
  }

  return GoogleAiStudioGeminiThreeDotOnePro;
}
