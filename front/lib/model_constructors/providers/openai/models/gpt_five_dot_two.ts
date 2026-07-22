import {
  type InputConfig,
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_2 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5.2
const CONTEXT_SIZE = 400_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "none";

// gpt-5.2 accepts none/low/medium/high/xhigh. "minimal" and the top "max" tier
// (Dust's universal "maximal") are unsupported and surface as an input
// configuration error.
const GPT_5_2_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

const configSchema = z.union([
  // Reasoning off is the default; the Responses API then allows a temperature.
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.literal("none") })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    temperature: temperatureSchema.optional(),
  }),
  // Reasoning on: the Responses API rejects an explicit temperature.
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.enum(GPT_5_2_REASONING_EFFORTS) }),
    temperature: z.undefined(),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotTwoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotTwo extends Base {
    static readonly model = GPT_5_2;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;

    // This model does not support explicit prompt cache breakpoints. They are
    // only supported starting with GPT-5.6.
    // https://developers.openai.com/api/docs/guides/prompt-caching#prompt-cache-breakpoints
    promptCacheBreakpointFor = () => ({});
  }

  return OpenAIGptFiveDotTwo;
}
