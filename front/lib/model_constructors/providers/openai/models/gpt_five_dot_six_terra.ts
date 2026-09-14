import { openaiTemperatureSchema } from "@app/lib/model_constructors/providers/openai/temperature";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_6_TERRA } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5.6-terra
const CONTEXT_SIZE = 272_000;
const MAX_OUTPUT_TOKENS = 64_000;
const DEFAULT_REASONING_EFFORT = "medium";

// gpt-5.6 accepts none/low/medium/high/xhigh/max. Our universal "maximal" maps
// to OpenAI's native "max" in the converter; "minimal" is unsupported and
// surfaces as an input configuration error.
const GPT_5_6_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

// Characterized against the live API (2026-07-27) by running the endpoint suite
// with the widest `inputConfigSchema`. Accepted efforts: none/low/medium/high/xhigh/maximal; 'minimal' is rejected with a 400.
//
// `temperature` is only a real knob with effort "none": the Responses API then
// accepts the full 0..2 range. With any other effort it accepts `1` and
// rejects every other value with "Unsupported parameter: 'temperature' is not
// supported with this model" — so the field is pinned to `z.literal(1)`,
// defaulted so callers can omit it.
export const GPT_5_6_TERRA_CONFIG_SCHEMA = z.union([
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.enum(GPT_5_6_REASONING_EFFORTS) })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    temperature: z.literal(1).optional().default(1),
  }),
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: openaiTemperatureSchema.optional(),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotSixTerraConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotSixTerra extends Base {
    static readonly model = GPT_5_6_TERRA;

    static readonly configSchema: z.ZodType<InputConfig> =
      GPT_5_6_TERRA_CONFIG_SCHEMA;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveDotSixTerra;
}
