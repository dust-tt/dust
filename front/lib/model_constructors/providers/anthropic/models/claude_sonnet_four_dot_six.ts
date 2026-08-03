import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { temperatureSchema } from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_SONNET_4_6 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const CONTEXT_SIZE = 1_000_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 128_000;

const baseConfig = anthropicBaseConfigSchema;

// Characterized against the live API (2026-07-27) by running both endpoint
// suites with the widest `inputConfigSchema`. `global/anthropic` and
// `eu/agent-platform` (Vertex) reject the same inputs — only the wording
// differs — so one schema covers both. Three constraints shape the union:
//
//   - `temperature` is the axis where 4.6 differs from Sonnet 5: it is still a
//     real knob here, but only while thinking is off. With an effort set, any
//     value but `1` is a 400 ("`temperature` may only be set to 1 when thinking
//     is enabled or in adaptive mode"); with effort "none", the full 0..1 range
//     is accepted. Hence the union. Sonnet 5 dropped sampling parameters
//     outright, which is why it needs no union at all.
//   - Effort `xhigh` is rejected — "This model does not support effort level
//     'xhigh'. Supported levels: high, low, max, medium" (Vertex phrases it
//     "Input should be 'low', 'medium', 'high' or 'max'"). `maximal` maps to
//     the native `max` and works.
//   - Effort "minimal" has no Anthropic equivalent and `assertNever`s in the
//     converter.
//
// Forcing a tool needs no special handling: 4.6 accepts a forced `tool_choice`
// alongside adaptive thinking at high effort (verified live on both endpoints).
// That restriction belongs to *extended* thinking, not adaptive.
//
// Note the reasoning `.default(...)`: Anthropic runs a `thinking`-less request
// on 4.6 *without* thinking, so the default here is a deliberate Dust
// divergence — see `anthropicBaseConfigSchema`.
const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(["low", "medium", "high", "maximal"]),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    temperature: z.literal(1).optional().default(1),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional(),
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

    static readonly model = CLAUDE_SONNET_4_6;

    static readonly configSchema: z.ZodType<
      ClaudeSonnetFourDotSix,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeSonnetFourDotSix;
}
