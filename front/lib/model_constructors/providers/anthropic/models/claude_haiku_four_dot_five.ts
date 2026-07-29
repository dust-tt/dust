import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { reasoningToExtendedThinkingConfig } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import { temperatureSchema } from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_HAIKU_4_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

// Verified against https://platform.claude.com/docs/en/about-claude/models/overview
// (2026-07-27): 200k context, 64k output, $1/$5 per MTok.
const CONTEXT_SIZE = 200_000;
const MAX_OUTPUT_TOKENS = 64_000;

// Haiku 4.5 supports **extended thinking only** — `thinking: {type: "enabled",
// budget_tokens: N}`. It has neither adaptive thinking (`{type: "adaptive"}`
// is rejected) nor the `output_config.effort` parameter, and it does not
// support interleaved thinking. That is why the endpoint overrides the
// converter's thinking leaf with `reasoningToExtendedThinkingConfig` below.
//
// Our effort names are therefore a Dust abstraction over `budget_tokens`
// (mapped in `EXTENDED_THINKING_BUDGET_TOKENS`), not an API parameter. The API
// only requires the budget to be >= 1024 and < `max_tokens`, so `xhigh` (8192)
// and `maximal` (16384) are accepted too — verified live on 2026-07-27 — but we
// deliberately expose the legacy low/medium/high set only, to keep this tier
// cheap and fast. Note `low` and `medium` both map to the 1024 minimum.
//
// Effort "none" turns thinking off with `thinking: {type: "disabled"}`, not a
// zero budget: `budget_tokens: 0` is rejected ("Input should be greater than or
// equal to 1024").
const DEFAULT_REASONING_EFFORT = "low";

const baseConfig = anthropicBaseConfigSchema;

// Characterized against the live API (2026-07-27) by running the endpoint suite
// with the widest `inputConfigSchema`. Three hard 400s shape the union:
//
//   - `temperature` 0 / 0.1 with thinking on — "`temperature` may only be set
//     to 1 when thinking is enabled". Thinking-off accepts any temperature.
//   - A forced `tool_choice` with thinking on — "Thinking may not be enabled
//     when tool_choice forces tool use". Forcing a tool requires effort "none".
//   - Effort "minimal" — it has no entry in the budget map, so the converter
//     emits `thinking.enabled` without `budget_tokens` and the API rejects it
//     ("budget_tokens: Field required").
const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(["low", "medium", "high"]),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    forceTool: z.undefined(),
    temperature: z.literal(1).optional().default(1),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional(),
  }),
]);

export type ClaudeHaikuFourDotFive = z.infer<typeof configSchema>;

// Mixin carrying shared config; runtime base differs per surface.
export function WithAnthropicClaudeHaikuFourDotFiveConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(Base: TBase) {
  abstract class AnthropicClaudeHaikuFourDotFive extends Base {
    // Narrow `Client`'s `["constructor"]` to this model's precise config so the
    // instance type carries `ClaudeHaikuFourDotFive` (not the wide `InputConfig`).
    declare ["constructor"]: BaseEndpointConfiguration<ClaudeHaikuFourDotFive>;

    static readonly model = CLAUDE_HAIKU_4_5;

    static readonly configSchema: z.ZodType<
      ClaudeHaikuFourDotFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly contextSize: number = CONTEXT_SIZE;
    // Typed as `number` (not the literal) so the Dust layer can cap it.
    static readonly maxOutputTokens: number = MAX_OUTPUT_TOKENS;

    // Haiku 4.5 has extended thinking but not adaptive thinking, so it overrides
    // the converter's default (adaptive) thinking leaf.
    reasoningToThinkingConfig = reasoningToExtendedThinkingConfig;
  }

  return AnthropicClaudeHaikuFourDotFive;
}
