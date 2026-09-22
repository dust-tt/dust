import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { CLAUDE_FABLE_5_1 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Real model spec. The Dust product cap (250k) is applied in the llms layer.
// https://platform.claude.com/docs/en/models/fable-5-1/overview (2026-09-22).
const CONTEXT_SIZE = 1_000_000;
const DEFAULT_REASONING_EFFORT = "high";
const MAX_OUTPUT_TOKENS = 128_000;

// Fable 5.1 keeps a standalone config rather than sharing one with Fable 5:
// the two differ on forced tool use (below), which is exactly the kind of
// divergence a shared config would paper over.
//
// Contract taken from Anthropic's own documentation (2026-09-22), which spells
// out what carries over from Fable 5 and what changed:
// https://platform.claude.com/docs/en/models/fable-5-1/whats-new-fable-5-1
//
//   - Forced tool use is a hard 400 on this model: `tool_choice` of type
//     "any" or "tool" returns *"type \"tool\" and \"any\" are not supported for
//     this model."* Thinking is always on and a forced call would skip it, so
//     `forceTool` is pinned to `undefined`. This is the one breaking change
//     against Fable 5, which accepts a forced `tool_choice`.
//   - `thinking: {type: "disabled"}` (and `{type: "enabled"}` with
//     `budget_tokens`) both 400: adaptive thinking is always on. Effort "none"
//     is therefore out, and an absent reasoning must default to a real effort
//     rather than fall through to disabled.
//   - Non-default `temperature`, `top_p` or `top_k` return a 400, unchanged
//     from Fable 5. Hence `z.literal(1)`, defaulted so callers can omit it. The
//     Dust layer strips it anyway via the `dropTemperature` config parser, but
//     the endpoint schema mirrors the API rather than that policy.
//
// All five effort levels (low/medium/high/xhigh/max) are supported, with `high`
// as the API default:
// https://platform.claude.com/docs/en/build-with-claude/effort (2026-09-22).
// "minimal" has no Anthropic equivalent and `assertNever`s in the converter, so
// the schema allows low/medium/high/xhigh/maximal only.
const reasoningSchema = z
  .object({
    effort: z.enum(ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS),
  })
  .default({ effort: DEFAULT_REASONING_EFFORT });

const configSchema = anthropicBaseConfigSchema.extend({
  reasoning: reasoningSchema,
  forceTool: z.undefined(),
  temperature: z.literal(1).optional().default(1),
});

export type ClaudeFableFiveDotOne = z.infer<typeof configSchema>;

export function WithAnthropicClaudeFableFiveDotOneConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeFableFiveDotOne extends Base {
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeFableFiveDotOne>;

    static readonly model = CLAUDE_FABLE_5_1;

    static readonly configSchema: z.ZodType<
      ClaudeFableFiveDotOne,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;
  }

  return AnthropicClaudeFableFiveDotOne;
}
