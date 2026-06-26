import {
  type InputConfig,
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_4_MINI_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5.4-mini
const CONTEXT_SIZE = 400_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "none";

// gpt-5.4-mini accepts none/low/medium/high (matching the legacy router).
// "minimal", "xhigh" and the universal "maximal" are unsupported and surface as
// an input configuration error.
const GPT_5_4_MINI_REASONING_EFFORTS = ["low", "medium", "high"] as const;

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
    reasoning: z.object({ effort: z.enum(GPT_5_4_MINI_REASONING_EFFORTS) }),
    temperature: temperatureSchema.optional().transform(() => undefined),
  }),
]);

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotFourMiniConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotFourMini extends Base {
    static readonly modelId = GPT_5_4_MINI_MODEL_ID;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveDotFourMini;
}
