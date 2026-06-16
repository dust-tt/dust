import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_4_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

const CONTEXT_SIZE = 1_000_000;
const MAX_OUTPUT_TOKENS = 128_000;

// gpt-5.4 accepts none/low/medium/high/xhigh natively; the universal "maximal"
// maps onto xhigh in the converter. "minimal" is rejected by the API.
const GPT_5_4_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
] as const;

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(GPT_5_4_REASONING_EFFORTS) })
    .optional(),
  // gpt-5.4 is a reasoning model; the Responses API rejects an explicit
  // temperature, so drop it.
  temperature: temperatureSchema.optional().transform(() => undefined),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotFourConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotFour extends Base {
    static readonly modelId = GPT_5_4_MODEL_ID;

    static readonly configSchema = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveDotFour;
}
