import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages.mjs";
import { z } from "zod";

import { AnthropicModel } from "@/providers/anthropic/model";
import {
  configInputSchema,
  maxOutputTokensSchema,
  temperatureSchema,
  toolSchema,
  topProbabilitySchema,
} from "@/types/config";

export const CLAUDE_SONNET_4_5_20250929_MODEL_ID =
  "claude-sonnet-4-5-20250929" as const;

const MIN_MAX_OUTPUT_TOKENS = 1;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 1;
const DEFAULT_TOP_PROBABILITY = 1;

// biome-ignore lint/style/useNamingConvention: Model name includes version identifier
export class ClaudeSonnet4_5V20250929 extends AnthropicModel {
  static override modelId = CLAUDE_SONNET_4_5_20250929_MODEL_ID;
  static override configSchema = configInputSchema
    .extend({
      temperature: temperatureSchema.optional().default(DEFAULT_TEMPERATURE),
      maxOutputTokens: maxOutputTokensSchema
        .min(MIN_MAX_OUTPUT_TOKENS)
        .nullable()
        .optional()
        .default(DEFAULT_MAX_OUTPUT_TOKENS),
      topProbability: topProbabilitySchema
        .optional()
        .default(DEFAULT_TOP_PROBABILITY),
      tools: z.array(toolSchema).optional().default([]),
    })
    .omit({
      reasoningEffort: true,
      reasoningDetailsLevel: true,
      topLogprobs: true,
    });

  toConfig(
    config: z.input<typeof ClaudeSonnet4_5V20250929.configSchema>
  ): Pick<
    MessageCreateParamsBase,
    "max_tokens" | "temperature" | "top_p" | "tools"
  > {
    const filledDefaults = ClaudeSonnet4_5V20250929.configSchema.parse(config);

    // Anthropic doesn't allow both temperature and top_p to be set
    // Prefer temperature if both are at default values, otherwise use whichever is non-default
    const useTemperature =
      filledDefaults.temperature !== DEFAULT_TEMPERATURE ||
      filledDefaults.topProbability === DEFAULT_TOP_PROBABILITY;

    const result: Pick<
      MessageCreateParamsBase,
      "max_tokens" | "temperature" | "top_p" | "tools"
    > = {
      max_tokens: filledDefaults.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      tools: filledDefaults.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: "object" as const,
          ...tool.inputSchema,
        },
      })),
    };

    if (useTemperature) {
      result.temperature = filledDefaults.temperature;
    } else {
      result.top_p = filledDefaults.topProbability;
    }

    return result;
  }
}
