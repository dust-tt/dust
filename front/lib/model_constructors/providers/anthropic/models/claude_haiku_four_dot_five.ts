import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import { reasoningToExtendedThinkingConfig } from "@app/lib/model_constructors/sdk/anthropic_ai/converters/input/utils";
import {
  inputConfigSchema,
  temperatureSchema,
} from "@app/lib/model_constructors/types/input/configuration";
import { CLAUDE_HAIKU_4_5_MODEL_ID } from "@app/lib/model_constructors/types/model_ids";

import { z } from "zod";

const CONTEXT_SIZE = 200_000;
const DEFAULT_REASONING_EFFORT = "low";
const MAX_OUTPUT_TOKENS = 64_000;

const baseConfig = inputConfigSchema.extend({
  cacheKey: z.undefined(),
});

const configSchema = z.union([
  baseConfig.extend({
    reasoning: z
      .object({
        effort: z.enum(["low", "medium", "high"]),
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

    static readonly modelId = CLAUDE_HAIKU_4_5_MODEL_ID;

    static readonly configSchema: z.ZodType<
      ClaudeHaikuFourDotFive,
      z.ZodTypeDef,
      unknown
    > = configSchema;

    static readonly contextSize = CONTEXT_SIZE;
    static readonly maxOutputTokens = MAX_OUTPUT_TOKENS;

    // Haiku 4.5 has extended thinking but not adaptive thinking, so it overrides
    // the converter's default (adaptive) thinking leaf.
    reasoningToThinkingConfig = reasoningToExtendedThinkingConfig;
  }

  return AnthropicClaudeHaikuFourDotFive;
}
