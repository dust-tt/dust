import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { CLAUDE_OPUS_4_6 } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const CONTEXT_SIZE = 1_000_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 128_000;

const baseConfig = anthropicBaseConfigSchema;

// Opus 4.6 has its own config rather than sharing the Opus 4.7/4.8 one because
// it differs on two axes: it predates the `xhigh` reasoning effort (introduced
// in 4.7), and unlike 4.7/4.8 it accepts a caller-supplied `temperature`
// (inherited from `inputConfigSchema`).
const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(["low", "medium", "high", "maximal"]),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    forceTool: z.undefined(),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
  }),
]);

export type ClaudeOpusFourDotSix = z.infer<typeof configSchema>;

// Mixin carrying shared config; runtime base differs per surface.
export function WithAnthropicClaudeOpusFourDotSixConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeOpusFourDotSix extends Base {
    // Narrow `Client`'s `["constructor"]` to this model's precise config so the
    // instance type carries `ClaudeOpusFourDotSix` (not the wide `InputConfig`).
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeOpusFourDotSix>;

    static readonly modelId = CLAUDE_OPUS_4_6;

    static readonly configSchema: z.ZodType<
      ClaudeOpusFourDotSix,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeOpusFourDotSix;
}
