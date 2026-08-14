import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import {
  GEMINI_3_CONTEXT_SIZE,
  GEMINI_3_MAX_OUTPUT_TOKENS,
} from "@app/lib/model_constructors/providers/google_ai_studio/models/shared";
import { GEMINI_PRO_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { GEMINI_3_7_FLASH } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://ai.google.dev/gemini-api/docs/latest-model (2026-08-14): thinking
// levels are low / medium (default) / high.
const DEFAULT_REASONING_EFFORT = "medium";

// Unlike the other Flash models, 3.7 Flash does not accept the `MINIMAL`
// thinking level: "thinking_level=MINIMAL is not available for 3.7 Flash.
// Explicitly setting thinking_level to MINIMAL will return an API validation
// error" (https://ai.google.dev/gemini-api/docs/latest-model, 2026-08-14) —
// confirmed live on 2026-08-14 ("Thinking level MINIMAL is not supported for
// this model", INVALID_ARGUMENT), on AI Studio and on the agent platform.
//
// Google documents exactly low/medium/high for this model, so that is what we
// expose — the same contract as Pro. Note that `none` (which maps to the
// deprecated `thinkingBudget: 0`) *is* accepted live and does turn thinking off
// (0 thought tokens, verified 2026-08-14), but it is undocumented for 3.7 Flash
// and can change without notice, so we keep it out of the schema.
const GEMINI_3_7_FLASH_REASONING_EFFORTS = [
  ...GEMINI_PRO_SUPPORTED_REASONING_EFFORTS,
] as const;

export const configSchema = googleAiStudioConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_3_7_FLASH_REASONING_EFFORTS),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithGoogleGeminiThreeDotSevenFlashConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleGeminiThreeDotSevenFlash extends Base {
    static readonly model = GEMINI_3_7_FLASH;

    static readonly configSchema = configSchema;

    static readonly contextSize = GEMINI_3_CONTEXT_SIZE;
    static readonly maxOutputTokens = GEMINI_3_MAX_OUTPUT_TOKENS;
  }

  return GoogleGeminiThreeDotSevenFlash;
}
