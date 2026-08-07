import { openaiTemperatureSchema } from "@app/lib/model_constructors/providers/openai/temperature";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_4 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5.4
const CONTEXT_SIZE = 1_050_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "none";

// gpt-5.4 accepts none/low/medium/high/xhigh. "minimal" and the top "max" tier
// (Dust's universal "maximal") are unsupported and surface as an input
// configuration error.
const GPT_5_4_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

// Characterized against the live API (2026-07-27) by running the endpoint suite
// with the widest `inputConfigSchema`. Accepted efforts: none/low/medium/high/xhigh; 'minimal', 'maximal' are rejected with a 400.
//
// `temperature` is only a real knob with effort "none": the Responses API then
// accepts the full 0..2 range. With any other effort it accepts `1` and
// rejects every other value with "Unsupported parameter: 'temperature' is not
// supported with this model" — so the field is pinned to `z.literal(1)`,
// defaulted so callers can omit it.
const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.enum(GPT_5_4_REASONING_EFFORTS) }),
    temperature: z.literal(1).optional().default(1),
  }),
  inputConfigSchema.extend({
    // The default lives on this branch: an absent `reasoning` means effort
    // "none" for this model.
    reasoning: z
      .object({ effort: z.literal("none") })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    temperature: openaiTemperatureSchema.optional(),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotFourConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotFour extends Base {
    static readonly model = GPT_5_4;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;

    // This model does not support explicit prompt cache breakpoints. They are
    // only supported starting with GPT-5.6.
    // https://developers.openai.com/api/docs/guides/prompt-caching#prompt-cache-breakpoints
    promptCacheBreakpointFor = () => ({});
  }

  return OpenAIGptFiveDotFour;
}
