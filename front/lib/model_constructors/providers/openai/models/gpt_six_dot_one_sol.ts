import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GPT_6_1_SOL } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Verified 2026-09-30: https://developers.openai.com/api/docs/models/gpt-6.1-sol
const CONTEXT_SIZE = 1_050_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "medium";

// Verified 2026-09-30: https://developers.openai.com/api/docs/models/gpt-6.1-sol
// gpt-6.1-sol accepts low/medium/high/xhigh/max, medium by default: "The `none`
// and `minimal` reasoning efforts are not supported." Our universal "maximal"
// maps to OpenAI's native "max" in the converter.
const GPT_6_1_SOL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

// Verified 2026-09-30: https://developers.openai.com/api/docs/guides/latest-model
// "When reasoning effort is not `none`, remove `temperature`, `top_p`, and
// `top_logprobs`." With no "none" effort, reasoning is always on; the live API
// accepts `temperature: 1` and rejects every other value.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(GPT_6_1_SOL_REASONING_EFFORTS) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: z.literal(1).optional().default(1),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptSixDotOneSolConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptSixDotOneSol extends Base {
    static readonly model = GPT_6_1_SOL;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    // Widen the literal so the Dust layer can cap the native context.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptSixDotOneSol;
}
