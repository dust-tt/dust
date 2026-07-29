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

// Characterized against the live API (2026-07-27) by running the endpoint suite
// with the widest `inputConfigSchema`. Accepted efforts: minimal/low/medium/high;
// 'none', 'xhigh' and the universal 'maximal' are rejected with a 400. Because
// there is no "none" effort ("`'none' is not supported`"), reasoning is always
// on and there is no thinking-off branch.
//
// `temperature` accepts exactly one value: `1` (the API default). Every other
// value is rejected with "Unsupported parameter: 'temperature' is not supported
// with this model" — so the field is `z.literal(1)`, defaulted so callers can
// omit it, rather than `z.undefined()`.
const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({ effort: z.enum(GPT_5_NANO_REASONING_EFFORTS) })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: z.literal(1).optional().default(1),
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

    // This model does not support explicit prompt cache breakpoints. They are
    // only supported starting with GPT-5.6.
    // https://developers.openai.com/api/docs/guides/prompt-caching#prompt-cache-breakpoints
    promptCacheBreakpointFor = () => ({});
  }

  return OpenAIGptFiveNano;
}
