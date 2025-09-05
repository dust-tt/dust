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
  "gpt-5": {
    input: 1.25,
    output: 10.0,
  },
  "gpt-5-mini": {
    input: 0.25,
    output: 2.0,
  },
  "gpt-5-nano": {
    input: 0.05,
    output: 0.4,
  },
  "gpt-4.1-2025-04-14": {
    input: 2.0,
    output: 8.0,
  },
  "gpt-4.1-mini-2025-04-14": {
    input: 0.4,
    output: 1.6,
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
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
  },
  "gpt-4o-mini-2024-07-18": {
    input: 0.15,
    output: 0.6,
  },
  "o1": {
    input: 15.0,
    output: 60.0,
  },
  "o1-2024-12-17": {
    input: 15.0,
    output: 60.0,
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
  "o3": {
    input: 2.0,
    output: 8.0,
  },
  "o3-mini": {
    input: 1.1,
    output: 4.4,
  },
  "o4-mini": {
    input: 1.1,
    output: 4.4,
  },
  "gpt-4-turbo": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-turbo-2024-04-09": {
    input: 10.0,
    output: 30.0,
  },
  "gpt-4-32k": {
    input: 60.0,
    output: 120.0,
  },
  "gpt-4": {
    input: 30.0,
    output: 60.0,
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
  "gpt-3.5-turbo": {
    input: 1.5,
    output: 2.0,
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
  "gpt-3.5-turbo-0613": {
    input: 1.5,
    output: 2.0,
  },
  "gpt-3.5-turbo-1106": {
    input: 1.0,
    output: 2.0,
  },
  "babbage-002": {
    input: 0.4,
    output: 0.4,
  },
  "davinci-002": {
    input: 2.0,
    output: 2.0,
  },
  "claude-4-opus-20250514": {
    input: 15.0,
    output: 75.0,
  },
  "claude-4-opus-latest": {
    input: 15.0,
    output: 75.0,
  },
  "claude-4-sonnet-20250514": {
    input: 3.0,
    output: 15.0,
  },
  "claude-4-sonnet-latest": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-7-sonnet-20250219": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-5-sonnet-20240620": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-5-sonnet-latest": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-5-haiku-20241022": {
    input: 0.8,
    output: 4.0,
  },
  "claude-3-opus-20240229": {
    input: 15.0,
    output: 75.0,
  },
  "claude-3-sonnet-20240229": {
    input: 3.0,
    output: 15.0,
  },
  "claude-3-haiku-20240307": {
    input: 0.25,
    output: 1.25,
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
  "gemini-2.5-pro": {
    input: 1.25,
    output: 10.0,
  },
  "gemini-2.5-pro-preview-03-25": {
    input: 1.25,
    output: 10.0,
  },
  "gemini-2.0-flash": {
    input: 0.10,
    output: 0.40,
  },
  "gemini-2.0-flash-lite": {
    input: 0.075,
    output: 0.30,
  },
  "gemini-1.5-pro-latest": {
    input: 1.25,
    output: 5.0,
  },
  "gemini-1.5-flash-latest": {
    input: 0.075,
    output: 0.30,
  },
  "mistral-large-latest": {
    input: 2.0,
    output: 6.0,
  },
  "mistral-small-latest": {
    input: 0.10,
    output: 0.30,
  },
  "codestral-latest": {
    input: 0.20,
    output: 0.60,
  },
  "mistral-embed": {
    input: 0.1,
    output: 0.1,
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
  "deepseek-chat": {
    input: 0.27,
    output: 1.10,
  },
  "deepseek-reasoner": {
    input: 0.55,
    output: 2.19,
  },
  "meta-llama/Llama-3.3-70B-Instruct-Turbo": {
    input: 0.9,
    output: 0.9,
  },
  "Qwen/Qwen2.5-Coder-32B-Instruct": {
    input: 1.2,
    output: 1.2,
  },
  "Qwen/QwQ-32B-Preview": {
    input: 1.2,
    output: 1.2,
  },
  "Qwen/Qwen2-72B-Instruct": {
    input: 0.9,
    output: 0.9,
  },
  "deepseek-ai/DeepSeek-V3": {
    input: 0.27,
    output: 1.10,
  },
  "deepseek-ai/DeepSeek-R1": {
    input: 0.55,
    output: 2.19,
  },
  "accounts/fireworks/models/deepseek-r1": {
    input: 8.0,
    output: 8.0,
  },
  "accounts/fireworks/models/kimi-k2-instruct": {
    input: 1.0,
    output: 3.0,
  },
  "grok-3-latest": {
    input: 2.0,
    output: 10.0,
  },
  "grok-3-mini-latest": {
    input: 0.3,
    output: 1.2,
  },
  "grok-3-fast-latest": {
    input: 2.0,
    output: 10.0,
  },
  "grok-3-mini-fast-latest": {
    input: 0.3,
    output: 1.2,
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
