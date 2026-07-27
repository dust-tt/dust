import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import {
  GEMINI_3_CONTEXT_SIZE,
  GEMINI_3_MAX_OUTPUT_TOKENS,
} from "@app/lib/model_constructors/providers/google_ai_studio/models/shared";
import { GEMINI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { GEMINI_3_6_FLASH } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

const DEFAULT_REASONING_EFFORT = "high";

// Narrowed from the general `inputConfigSchema` after running the endpoint
// tests: Gemini 3.6 Flash accepts the same input contract as Gemini 3.5 Flash
// (native thinking levels minimal/low/medium/high; `none` and `maximal`
// rejected; temperature coerced to 1; implicit caching so no explicit key).
export const configSchema = googleAiStudioConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_SUPPORTED_REASONING_EFFORTS),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithGoogleAiStudioGeminiThreeDotSixFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleAiStudioGeminiThreeDotSixFlash extends Base {
    static readonly model = GEMINI_3_6_FLASH;

    static readonly configSchema = configSchema;

    static readonly contextSize = GEMINI_3_CONTEXT_SIZE;
    static readonly maxOutputTokens = GEMINI_3_MAX_OUTPUT_TOKENS;
  }

  return GoogleAiStudioGeminiThreeDotSixFlash;
}
