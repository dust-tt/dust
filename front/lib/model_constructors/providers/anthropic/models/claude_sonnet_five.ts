import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { CLAUDE_SONNET_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const CONTEXT_SIZE = 1_000_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 128_000;

const baseConfig = anthropicBaseConfigSchema.extend({
  temperature: z.undefined(),
});

const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    forceTool: z.undefined(),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
  }),
]);

export type ClaudeSonnetFive = z.infer<typeof configSchema>;

// Mixin carrying shared config; runtime base differs per surface.
export function WithAnthropicClaudeSonnetFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeSonnetFive extends Base {
    // Narrow `Client`'s `["constructor"]` to this model's precise config so the
    // instance type carries `ClaudeSonnetFive` (not the wide `InputConfig`).
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeSonnetFive>;

    static readonly model = CLAUDE_SONNET_5;

    static readonly configSchema: z.ZodType<
      ClaudeSonnetFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeSonnetFive;
}
