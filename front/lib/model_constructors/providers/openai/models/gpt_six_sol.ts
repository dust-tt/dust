import { openaiTemperatureSchema } from "@app/lib/model_constructors/providers/openai/temperature";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GPT_6_SOL } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Verified 2026-09-22: https://developers.openai.com/api/docs/models/gpt-6-sol
const CONTEXT_SIZE = 1_050_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "medium";

// Verified 2026-09-22: https://developers.openai.com/api/docs/models/gpt-6-sol
// gpt-6-sol accepts none/low/medium/high/xhigh/max, medium by default. Our
// universal "maximal" maps to OpenAI's native "max" in the converter;
// "minimal" is gone from the GPT-6 family (the migration guide sends it to
// "low") and surfaces as an input configuration error.
const GPT_6_SOL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

// Verified 2026-09-22: https://developers.openai.com/api/docs/guides/latest-model
// "When reasoning effort is not `none`, remove `temperature`, `top_p`, and
// `top_logprobs`." As on gpt-5.6-sol, `temperature` is only a real knob with
// effort "none", where the Responses API takes the full 0..2 range; every
// other effort accepts `1` alone, so the field is pinned and defaulted.
const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.enum(GPT_6_SOL_REASONING_EFFORTS) })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    temperature: z.literal(1).optional().default(1),
  }),
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: openaiTemperatureSchema.optional(),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptSixSolConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptSixSol extends Base {
    static readonly model = GPT_6_SOL;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    // Widen the literal so the Dust layer can cap the native context.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptSixSol;
}
