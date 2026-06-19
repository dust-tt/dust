import { GEMINI_PRO_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GEMINI_3_1_PRO_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// Verified against https://ai.google.dev/gemini-api/docs/models (2026-06-18):
// Gemini 3 Pro has a 1M-token context window and up to 64k output tokens.
const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 65_536;
const DEFAULT_REASONING_EFFORT = "high";

const baseConfig = inputConfigSchema.extend({
  // Gemini uses implicit caching; we do not pass an explicit cache key.
  cacheKey: z.undefined(),
});

// Pro supports the low/medium/high thinking levels (no `minimal`) and strongly
// recommends `temperature: 1`, so we coerce temperature to 1.
const configSchema = baseConfig.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_PRO_SUPPORTED_REASONING_EFFORTS),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: temperatureSchema.optional().transform(() => 1 as const),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithGoogleAiStudioGemini31ProConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class GoogleAiStudioGemini31Pro extends Base {
    static readonly modelId = GEMINI_3_1_PRO_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return GoogleAiStudioGemini31Pro;
}
