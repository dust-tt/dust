import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { GEMINI_FLASH_LITE_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { GEMINI_3_1_FLASH_LITE_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";
import { z } from "zod";

export const CONTEXT_SIZE = 1_000_000;
export const MAX_OUTPUT_TOKENS = 65_536;

const DEFAULT_REASONING_EFFORT = "minimal";

// Flash-Lite is the only Gemini model that exposes `none` (legacy parity).
export const configSchema = googleAiStudioConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_FLASH_LITE_SUPPORTED_REASONING_EFFORTS),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithGoogleAiStudioGeminiThreeDotOneFlashLiteConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleAiStudioGeminiThreeDotOneFlashLite extends Base {
    static readonly modelId = GEMINI_3_1_FLASH_LITE_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return GoogleAiStudioGeminiThreeDotOneFlashLite;
}
