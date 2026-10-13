import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { GEMINI_3_MAX_OUTPUT_TOKENS } from "@app/lib/model_constructors/providers/google_ai_studio/models/shared";
import { GEMINI_PRO_SUPPORTED_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { GEMINI_4_ARGON } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://ai.google.dev/gemini-api/docs/thinking (2026-10-13): Gemini 4 Argon
// supports low, medium, and high thinking levels, with medium as the default.
// Minimal is rejected with INVALID_ARGUMENT. Thinking-off (budget 0) is
// undocumented: Agent Platform rejects it and AI Studio accepts it (verified
// live on 2026-10-13).
export const configSchema = googleAiStudioConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum(GEMINI_PRO_SUPPORTED_REASONING_EFFORTS),
    })
    .default({ effort: "medium" }),
});

export function WithGoogleGeminiFourArgonConfig<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class GoogleGeminiFourArgon extends Base {
    static readonly model = GEMINI_4_ARGON;

    static readonly configSchema = configSchema;

    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/4-argon
    // (2026-10-13): The context window is 1,048,576 tokens. Long decodes go up
    // to 1M output tokens, but a single streaming request generates at most
    // 65,536 thinking and output tokens.
    static readonly contextSize = 1_048_576;
    static readonly maxOutputTokens = GEMINI_3_MAX_OUTPUT_TOKENS;
  }

  return GoogleGeminiFourArgon;
}
