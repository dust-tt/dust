import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { CLAUDE_FABLE_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
const CONTEXT_SIZE = 1_000_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 128_000;

// Fable 5 is the only model of its family, so this config is standalone rather
// than a shared one.
//
// Characterized against the live Anthropic API (EAP key, 2026-07-27) by running
// the endpoint suite with the widest `inputConfigSchema`. Two hard 400s:
//
//   - `thinking: {type: "disabled"}` — *"is not supported for this model.
//     Thinking defaults to adaptive mode when not specified."* Unlike Opus
//     4.7/4.8/5, Fable 5 cannot turn thinking off, so effort "none" is out and
//     an absent reasoning must default to a real effort rather than fall
//     through to disabled.
//   - `temperature` 0 / 0.1 / 0.5 — *"`temperature` may only be set to 1 when
//     thinking is enabled or in adaptive mode."* Thinking is always on here, so
//     1 is the only value the API accepts (above 1 fails the `range: 0..1`
//     check). Hence `z.literal(1)`, defaulted so callers can omit it. The Dust
//     layer strips it anyway via the `dropTemperature` config parser, but the
//     endpoint schema mirrors the API rather than that policy.
//
// "minimal" has no Anthropic equivalent and `assertNever`s in the converter, so
// the schema allows low/medium/high/xhigh/maximal only.
//
// Forcing a tool needs no special handling: Fable 5 accepts a forced
// `tool_choice` alongside adaptive thinking (verified live), as do Opus
// 4.7/4.8/5. That restriction belongs to *extended* thinking, not adaptive.
const reasoningSchema = z
  .object({
    effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
  })
  .default({ effort: DEFAULT_REASONING_EFFORT });

const configSchema = anthropicBaseConfigSchema.extend({
  reasoning: reasoningSchema,
  temperature: z.literal(1).optional().default(1),
});

export type ClaudeFableFive = z.infer<typeof configSchema>;

export function WithAnthropicClaudeFableFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeFableFive extends Base {
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeFableFive>;

    static readonly model = CLAUDE_FABLE_5;

    static readonly configSchema: z.ZodType<
      ClaudeFableFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeFableFive;
}
