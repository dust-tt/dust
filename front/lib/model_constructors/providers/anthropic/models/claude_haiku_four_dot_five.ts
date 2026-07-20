import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { reasoningToExtendedThinkingConfig } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import { temperatureSchema } from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_HAIKU_4_5 } from "@app/lib/model_constructors/types/models";

import { z } from "zod";

const CONTEXT_SIZE = 200_000;
const DEFAULT_REASONING_EFFORT = "low";
const MAX_OUTPUT_TOKENS = 64_000;

const baseConfig = anthropicBaseConfigSchema;

const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(["low", "medium", "high"]),
      })
      .default({ effort: DEFAULT_REASONING_EFFORT }),
    forceTool: z.undefined(),
    // Reasoning requires temperature=1.
    temperature: z.literal(1).optional().default(1),
  }),
  baseConfig.extend({
    reasoning: z.object({ effort: z.literal("none") }),
    temperature: temperatureSchema.optional().default(1),
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
