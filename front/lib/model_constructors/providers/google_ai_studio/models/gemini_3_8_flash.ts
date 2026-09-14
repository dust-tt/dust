import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { GEMINI_3_MAX_OUTPUT_TOKENS } from "@app/lib/model_constructors/providers/google_ai_studio/models/shared";
import { GEMINI_PRO_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { GEMINI_3_8_FLASH } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://ai.google.dev/gemini-api/docs/latest-model (2026-09-04): Gemini 3.8
// Flash supports low, medium, and high thinking levels, with medium as the
// default. Minimal is rejected, and thinking-off remains undocumented even
// though the AI Studio endpoint accepted it in live tests on 2026-09-04.
export const configSchema = googleAiStudioConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_PRO_SUPPORTED_REASONING_EFFORTS),
    })
    .default({ effort: "medium" }),
});

export function WithGoogleGeminiThreeDotEightFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleGeminiThreeDotEightFlash extends Base {
    static readonly model = GEMINI_3_8_FLASH;

    static readonly configSchema = configSchema;

    // https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
    // (2026-09-04): The input token limit is 1,048,576.
    static readonly contextSize = 1_048_576;
    static readonly maxOutputTokens = GEMINI_3_MAX_OUTPUT_TOKENS;
  }

  return GoogleGeminiThreeDotEightFlash;
}
