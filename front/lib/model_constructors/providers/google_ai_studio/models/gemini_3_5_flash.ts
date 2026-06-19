import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import {
  GEMINI_3_CONTEXT_SIZE,
  GEMINI_3_MAX_OUTPUT_TOKENS,
} from "@app/lib/model_constructors/providers/google_ai_studio/models/shared";
import { GEMINI_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { GEMINI_3_5_FLASH_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

export const CONTEXT_SIZE = 1_000_000;
export const MAX_OUTPUT_TOKENS = 65_536;

const DEFAULT_REASONING_EFFORT = "high";

export const configSchema = googleAiStudioConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_SUPPORTED_REASONING_EFFORTS),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithGoogleAiStudioGeminiThreeDotFiveFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleAiStudioGeminiThreeDotFiveFlash extends Base {
    static readonly modelId = GEMINI_3_5_FLASH_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = GEMINI_3_CONTEXT_SIZE;
    static readonly maxOutputTokens = GEMINI_3_MAX_OUTPUT_TOKENS;
  }

  return GoogleAiStudioGeminiThreeDotFiveFlash;
}
