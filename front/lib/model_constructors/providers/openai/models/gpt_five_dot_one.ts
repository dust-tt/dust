import {
  type InputConfig,
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_1_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5.1
const CONTEXT_SIZE = 400_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "none";

// gpt-5.1 accepts none/low/medium/high (matching the legacy router). "minimal",
// "xhigh" and the universal "maximal" are unsupported and surface as an input
// configuration error.
const GPT_5_1_REASONING_EFFORTS = ["none", "low", "medium", "high"] as const;

// gpt-5.1 rejects temperature entirely (unlike gpt-5.5 which allows it with reasoning: none).
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(GPT_5_1_REASONING_EFFORTS) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  // The Responses API rejects temperature for gpt-5.1 regardless of reasoning effort.
  temperature: temperatureSchema.optional().transform(() => undefined),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveDotOneConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveDotOne extends Base {
    static readonly modelId = GPT_5_1_MODEL_ID;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return OpenAIGptFiveDotOne;
}
