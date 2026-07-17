import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import {
  inputConfigSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_FABLE_5_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const CONTEXT_SIZE = 1_000_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 128_000;

const reasoningSchema = z.object({
      effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
    })
  .default({ effort: DEFAULT_REASONING_EFFORT });

const configSchema = inputConfigSchema.extend({
  cacheKey: z.undefined(),
  reasoning: reasoningSchema,
  temperature: z.undefined()
});

export type ClaudeFableFive = z.infer<typeof configSchema>;

export function WithAnthropicClaudeFableFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeFableFive extends Base {
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeFableFive>;

    static readonly modelId = CLAUDE_FABLE_5_MODEL_ID;

    static readonly configSchema: z.ZodType<
      ClaudeFableFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeFableFive;
}
