import {
  type InputConfig,
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5
const CONTEXT_SIZE = 400_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "medium";

// gpt-5 accepts minimal/low/medium/high. Unlike gpt-5.5 it does NOT support
// "none" or "xhigh"; the universal "maximal" (maps to xhigh) is unsupported
// too. They all surface as an input configuration error.
const GPT_5_REASONING_EFFORTS = ["minimal", "low", "medium", "high"] as const;

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(GPT_5_REASONING_EFFORTS) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  // gpt-5 rejects any explicit temperature; reasoning is always on.
  temperature: temperatureSchema.optional().transform(() => undefined),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFive extends Base {
    static readonly modelId = GPT_5_MODEL_ID;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFive;
}
