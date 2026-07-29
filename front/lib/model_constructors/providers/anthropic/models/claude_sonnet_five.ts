import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { CLAUDE_SONNET_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const CONTEXT_SIZE = 1_000_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 128_000;

// Characterized against the live API (2026-07-27) by running both endpoint
// suites with the widest `inputConfigSchema`. `global/anthropic` and
// `eu/agent-platform` (Vertex) returned exactly the same 21 rejections, so one
// schema covers both. Two constraints shape it:
//
//   - `temperature` accepts exactly one value: `1` (or absent, which means the
//     same thing — 1 is the API default). Anything in [0, 1) is a 400 —
//     "`temperature` is deprecated for this model" with thinking off,
//     "`temperature` may only be set to 1 when thinking is enabled or in
//     adaptive mode" with thinking on — and anything above 1 fails the
//     `range: 0..1` check. Hence `z.literal(1)`, defaulted so callers can omit
//     it. The Dust layer strips it anyway via the `dropTemperature` config
//     parser, but the endpoint schema mirrors the API rather than that policy.
//   - Effort "minimal" has no Anthropic equivalent and `assertNever`s in the
//     converter, so it is excluded from the effort enum.
//
// Forcing a tool needs no special handling: Sonnet 5 accepts a forced
// `tool_choice` alongside adaptive thinking (verified live on both endpoints).
// That restriction belongs to *extended* thinking ("Thinking may not be enabled
// when tool_choice forces tool use", still true on Haiku 4.5), not to adaptive.
//
// Sonnet 4.6 has not been characterized against the live API yet, so this stays
// a standalone config rather than a shared Sonnet-family one.
const configSchema = anthropicBaseConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([
        ...ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
        "none",
      ]),
    })
    .default({ effort: DEFAULT_REASONING_EFFORT }),
  temperature: z.literal(1).optional().default(1),
});

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
