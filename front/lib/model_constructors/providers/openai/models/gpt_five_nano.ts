import {
  type InputConfig,
  inputConfigSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { GPT_5_NANO } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// https://developers.openai.com/api/docs/models/gpt-5-nano
const CONTEXT_SIZE = 400_000;
const MAX_OUTPUT_TOKENS = 128_000;
const DEFAULT_REASONING_EFFORT = "medium";

const GPT_5_NANO_REASONING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
] as const;

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(GPT_5_NANO_REASONING_EFFORTS) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  // The Responses API rejects an explicit temperature while reasoning is on.
  temperature: z.undefined(),
});

// Mixin carrying shared config; runtime base differs per surface.
export function WithOpenAIGptFiveNanoConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class OpenAIGptFiveNano extends Base {
    static readonly model = GPT_5_NANO;

    static readonly configSchema: z.ZodType<InputConfig> = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;

    // This model rejects explicit prompt cache breakpoints, which are only
    // supported starting with GPT-5.6.
    // https://developers.openai.com/api/docs/guides/prompt-caching#prompt-cache-breakpoints
    promptCacheBreakpointFor = () => ({});
  }

  return OpenAIGptFiveNano;
}
