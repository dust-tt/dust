import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

const CONTEXT_SIZE = 400_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 64_000;

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.undefined(),
});

const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    forceTool: z.undefined(),
    // Reasoning requires temperature=1.
    temperature: temperatureSchema.optional().transform(() => 1 as const),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional().default(1),
  }),
]);

export type ClaudeSonnetFourDotSix = z.infer<typeof configSchema>;

// Mixin carrying shared config; runtime base differs per surface.
export function WithAnthropicClaudeSonnetFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeSonnetFourDotSix extends Base {
    // Narrow `Client`'s `["constructor"]` to this model's precise config so the
    // instance type carries `ClaudeSonnetFourDotSix` (not the wide `InputConfig`).
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeSonnetFourDotSix>;

    static readonly modelId = CLAUDE_SONNET_4_6_MODEL_ID;

    static readonly configSchema: z.ZodType<
      ClaudeSonnetFourDotSix,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeSonnetFourDotSix;
}
