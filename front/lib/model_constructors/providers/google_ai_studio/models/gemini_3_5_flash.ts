import {
  GEMINI_3_CONTEXT_SIZE,
  GEMINI_3_MAX_OUTPUT_TOKENS,
  geminiV3ConfigSchema,
} from "@app/lib/model_constructors/providers/google_ai_studio/models/shared";
import { GEMINI_3_5_FLASH_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

// Mixin carrying shared config; runtime base differs per surface.
export function WithGoogleAiStudioGemini35FlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleAiStudioGemini35Flash extends Base {
    static readonly modelId = GEMINI_3_5_FLASH_MODEL_ID;

    static readonly configSchema = geminiV3ConfigSchema;

    static readonly contextSize = GEMINI_3_CONTEXT_SIZE;
    static readonly maxOutputTokens = GEMINI_3_MAX_OUTPUT_TOKENS;
  }

  return GoogleAiStudioGemini35Flash;
}
