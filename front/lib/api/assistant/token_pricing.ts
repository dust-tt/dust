import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { ModelIdType as BaseModelIdType } from "@app/types";

// We extend the base ModelIdType to include all string values to ensure we can still compute token
// usage for historical runs even when models are deprecated or removed from the base type.
type ModelIdType = BaseModelIdType | string;

// Pricing (in USD) per million of tokens by model.
export const MODEL_PRICING: Record<
  ModelIdType,
  {
    input: number;
    output: number;
  }
> = {
  "gpt-4-32k": {
    input: 60.0,
    output: 120.0,
  },
  "gpt-4": {
    input: 30.0,
    output: 60.0,
  },
  "gpt-4-turbo-2024-04-09": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-turbo": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-0125-preview": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-1106-preview": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-vision-preview": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-3.5-turbo-16k-0613": {
    input: 3.0,
    output: 4.0,
  },
  "gpt-3.5-turbo-0301": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo-0125": {
    input: 0.5,
    output: 1.5,
  },
  "gpt-3.5-turbo-16k": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo-instruct": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo-0613": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
  "gpt-4o-mini-2024-07-18": {
    input: 0.15,
    output: 0.6,
  },
  "gpt-4o": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-4o-2024-11-20": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-4o-2024-08-06": {
    input: 2.5,
    output: 10.0,
  },
  "gpt-4o-2024-05-13": {
    input: 5.0,
    output: 15.0,
  },
  "o1-preview": {
    input: 15.0,
    output: 60.0,
  },
  "o1-preview-2024-09-12": {
    input: 15.0,
    output: 60.0,
  },
  "o1-mini": {
    input: 3.0,
    output: 12.0,
  },
  "o1-mini-2024-09-12": {
    input: 3.0,
    output: 12.0,
  },
  "gemini-1.5-pro-latest": {
    input: 3.5,
    output: 10.5,
  },
  "gemini-1.5-flash-latest": {
    input: 0.35,
    output: 1.05,
  },
  "claude-2.0": {
    input: 8.0,
    output: 24.0,
  },
  "claude-2.1": {
    input: 8.0,
    output: 24.0,
  },
  "claude-instant-1.2": {
    input: 0.8,
    output: 2.4,
  },
  "claude-3-haiku-20240307": {
    input: 0.25,
    output: 1.25,
  },
  "claude-3-5-haiku-20241022": {
    input: 1.0,
    output: 5.0,
  },
  "claude-3-sonnet-20240229": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-opus-20240229": {
    input: 15.0,
    output: 75.0,
  },
  "claude-3-5-sonnet-20240620": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-5-sonnet-latest": {
    input: 3.0,
    output: 15.0,
  },
  "mistral-embed": {
    input: 0.1,
    output: 0.1,
  },
  "babbage-002": {
    input: 0.4,
    output: 0.4,
  },
  "davinci-002": {
    input: 2.0,
    output: 2.0,
  },
  "gpt-3.5-turbo-1106": {
    input: 1.0,
    output: 2.0,
  },
  "open-mistral-7b": {
    input: 0.25,
    output: 0.25,
  },
  "open-mixtral-8x7b": {
    input: 0.7,
    output: 0.7,
  },
  "mistral-small-2402": {
    input: 0.9,
    output: 2.8,
  },
  "mistral-small-latest": {
    input: 0.9,
    output: 2.8,
  },
  "codestral-latest": {
    input: 0.9,
    output: 2.8,
  },
  "codestral-2405": {
    input: 0.9,
    output: 2.8,
  },
  "open-mixtral-8x22b": {
    input: 1.9,
    output: 5.6,
  },
  "mistral-medium-2312": {
    input: 2.5,
    output: 7.5,
  },
  "mistral-large-2402": {
    input: 3.8,
    output: 11.3,
  },
  "mistral-large-2407": {
    input: 3.0,
    output: 9.0,
  },
  "mistral-large-latest": {
    input: 2.0,
    output: 6.0,
  },
  "o1-2024-12-17": {
    input: 15.0,
    output: 60.0,
  },
  o1: {
    input: 15.0,
    output: 60.0,
  },
  "gpt-4.1-mini-2025-04-14": {
    input: 0.4,
    output: 1.6,
  },
  "gpt-4.1-2025-04-14": {
    input: 2.0,
    output: 8.0,
  },
  "deepseek-chat": {
    input: 0.14,
    output: 0.28,
  },
  "accounts/fireworks/models/deepseek-r1": {
    input: 8.0,
    output: 8.0,
  },
  "o3-mini": {
    input: 1.1,
    output: 4.4,
  },
  "claude-3-7-sonnet-20250219": {
    input: 3.0,
    output: 15.0,
  },
  "gemini-2.0-flash": {
    input: 0.15,
    output: 0.6,
  },
  "gemini-2.5-pro-preview-03-25": {
    input: 1.25,
    output: 15.0,
  },
};

// If model is not found in the MODEL_PRICING, use the default pricing.
const DEFAULT_PRICING_MODEL_ID = "gpt-4o";

const DEFAULT_PRICING = MODEL_PRICING[DEFAULT_PRICING_MODEL_ID];

/**
 * Calculate the cost in USD for token usage.
 */
function calculateTokenUsageCostForUsage(usage: RunUsageType): number {
  const pricing = MODEL_PRICING[usage.modelId] ?? DEFAULT_PRICING;

  return (
    (usage.promptTokens / 1_000_000) * pricing.input +
    (usage.completionTokens / 1_000_000) * pricing.output
  );
}

export function calculateTokenUsageCost(usages: RunUsageType[]): number {
  return usages.reduce(
    (acc, usage) => acc + calculateTokenUsageCostForUsage(usage),
    0
  );
}
