import type { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages.mjs";
import { z } from "zod";

import { AnthropicModel } from "@/providers/anthropic/model";
import {
  maxOutputTokensSchema,
  temperatureSchema,
  toolSchema,
  topProbabilitySchema,
} from "@/types/config";

export const CLAUDE_SONNET_4_5_20250929_MODEL_ID =
  "claude-sonnet-4-5-20250929" as const;

const MIN_MAX_OUTPUT_TOKENS = 1;
const MAX_MAX_OUTPUT_TOKENS = 64_000;
const DEFAULT_TEMPERATURE = 1;

// Can not have both temperature and top_p defined, but must have at least one of them (or default to temperature)
const RANDOMNESS_SCHEMA = z.union([
  z.object({
    temperature: temperatureSchema.optional().default(DEFAULT_TEMPERATURE),
    topProbability: z.undefined(),
  }),
  z.object({
    temperature: z.undefined(),
    topProbability: topProbabilitySchema,
  }),
]);

const BASE_CONFIG_SCHEMA = z.object({
  maxOutputTokens: maxOutputTokensSchema
    .min(MIN_MAX_OUTPUT_TOKENS)
    .max(MAX_MAX_OUTPUT_TOKENS),
  tools: z.array(toolSchema).optional().default([]),
});

// biome-ignore lint/style/useNamingConvention: Model name includes version identifier
export class ClaudeSonnet4_5V20250929 extends AnthropicModel {
  static override modelId = CLAUDE_SONNET_4_5_20250929_MODEL_ID;
  static override configSchema = BASE_CONFIG_SCHEMA.and(RANDOMNESS_SCHEMA);

  toConfig(
    config: z.input<typeof ClaudeSonnet4_5V20250929.configSchema>
  ): Pick<
    MessageCreateParamsBase,
    "max_tokens" | "temperature" | "top_p" | "tools"
  > {
    const filledDefaults = ClaudeSonnet4_5V20250929.configSchema.parse(config);

    const result: Pick<
      MessageCreateParamsBase,
      "max_tokens" | "temperature" | "top_p" | "tools"
    > = {
      max_tokens: filledDefaults.maxOutputTokens,
      ...(filledDefaults.temperature !== undefined
        ? { temperature: filledDefaults.temperature }
        : {}),
      ...(filledDefaults.topProbability !== undefined
        ? { top_p: filledDefaults.topProbability }
        : {}),
      tools: filledDefaults.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: {
          type: "object" as const,
          ...tool.inputSchema,
        },
      })),
    };

    return result;
  }
}
