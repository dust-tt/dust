import {
  type InputConfig,
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_5_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5.5
const CONTEXT_SIZE = 1_050_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "medium";

// gpt-5.5 accepts none/low/medium/high/xhigh. "minimal" and the universal
// "maximal" are unsupported and surface as an input configuration error.
const GPT_5_5_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

const configSchema = z.union([
  inputConfigSchema.extend({
    reasoning: z
      .object({ effort: z.enum(GPT_5_5_REASONING_EFFORTS) })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    // The Responses API rejects an explicit temperature while reasoning is on.
    temperature: temperatureSchema.optional().transform(() => undefined),
  }),
  inputConfigSchema.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional(),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotFive extends Base {
    static readonly modelId = GPT_5_5_MODEL_ID;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveDotFive;
}
