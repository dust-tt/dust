// This module explains the relative composition of an agent message's cost. It does not
// reproduce the bill: the authoritative charge is the Metronome AWU amount, rounded up per
// execution. These attributed micro-credits are un-rounded and cache-naive, so they are not
// expected to sum to the billed amount. Their job is to rank what drove the cost, not to
// reconcile euros.
import {
  computeTokensCostForUsageInMicroUsd,
  inferenceRegionForEndpointRegion,
} from "@app/lib/api/assistant/token_pricing";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

// Version 1 attributed the model token buckets only. Version 2 added per-tool rows and netted the
// tool-call emission out of the assistant output bucket. Version 3 expands an enabled skill's tool
// input footprint with the instructions and tool definitions that the action adds to later model
// requests. Version 4 keeps sandbox-child actions as direct-charge-only rows because their calls
// and results reach the outer model through their parent Computer action. Version 5 removes the
// context-window safety padding from tool footprints and uses o200k for GPT-5 provider accounting.
// Version 6 excludes enabled-skill tool definitions when provider-side tool search keeps those
// non-eager tools deferred, while continuing to attribute the enabled skill's instructions.
// Version 7 records post-cap MCP server calls with zero direct credits.
// Version 8 prices tokens at the run usage's service tier, so flex runs use the discounted rates.
// Version 9 also drops explicit model token count adjustments from tool footprints, which only
// Anthropic models declared, so their tool rows use the raw tokenizer estimate.
// Version 10 prices tokens at the run usage's inference region, so EU runs use the regional rates.
// Each version remains a separate, self-consistent set of rows.
export const AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION = 10;

export type RunUsageForAttribution = Pick<
  RunUsageWithRunKeyType,
  | "completionTokens"
  | "isBatch"
  | "modelId"
  | "promptTokens"
  | "reasoningTokens"
  | "region"
  | "serviceTier"
>;

type GrossAttributedCredits = {
  grossAttributedCreditAmountMicro: number;
};

type ModelAttributionItem =
  | (GrossAttributedCredits & {
      itemType: "input";
      inputTokensCount: number;
    })
  | (GrossAttributedCredits & {
      itemType: "output" | "reasoning";
      outputTokensCount: number;
    });

type MeasuredToolCall<TTool> = {
  tool: TTool;
  /** Estimated model output tokens used to emit the tool name and parameters */
  measuredOutputTokensCount: number;
};

type ToolCallAttribution<TTool> = GrossAttributedCredits & {
  tool: TTool;
  /** Estimated model output tokens used to emit the tool name and parameters */
  outputTokensCount: number;
};

type ToolAttribution<TTool> = ToolCallAttribution<TTool> & {
  /** Estimated model input footprint of the result returned by the tool */
  inputTokensCount: number | null;
  directCreditAmountMicro: number | null;
};

type RunUsageAttribution<TTool> = {
  modelItems: ModelAttributionItem[];
  toolCalls: ToolCallAttribution<TTool>[];
};

function assertNonNegative(value: number, message: string): void {
  assert(value >= 0, `${message}. Received ${value}.`);
}

/**
 * Provider totals are exact attribution inputs. Reject impossible shapes rather than changing
 * provider facts to make them reconcile.
 */
function assertValidRunUsage(usage: RunUsageForAttribution): void {
  assertNonNegative(usage.promptTokens, "Prompt tokens must be non-negative");
  assertNonNegative(
    usage.completionTokens,
    "Completion tokens must be non-negative"
  );
  if (usage.reasoningTokens !== null) {
    assertNonNegative(
      usage.reasoningTokens,
      "Reasoning tokens must be non-negative"
    );
    assert(
      usage.reasoningTokens <= usage.completionTokens,
      "Reasoning tokens cannot exceed completion tokens."
    );
  }
}

/** Converts provider cost into millionths of a Dust credit. */
function creditAmountMicroFromCostMicroUsd(costMicroUsd: number): number {
  return Math.round(
    (costMicroUsd * MICRO_CREDITS_PER_CREDIT) /
      MODEL_COST_MICRO_USD_PER_AWU_CREDIT
  );
}

function priceUsageTokens(
  usage: RunUsageForAttribution,
  tokens: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number | null;
    cacheCreationTokens: number | null;
  }
): number {
  return computeTokensCostForUsageInMicroUsd({
    modelId: usage.modelId,
    ...tokens,
    isBatch: usage.isBatch,
    serviceTier: usage.serviceTier,
    inferenceRegion: usage.region
      ? inferenceRegionForEndpointRegion(usage.region)
      : "global",
  });
}

/**
 * Derives input and output rates from model pricing at full rate, ignoring cache reads and writes.
 * Gross rows are stored at this cache-naive price; reconciliation applies each call's cache
 * discounts and premiums from its recorded cost. Empty usages use one token for the rate
 * calculation to avoid division by zero.
 */
/**
 * @cc [owner:sfriquet,label:product] rates-match-recorded-cost-pricing
 * Rates MUST come from the pricing entry and multipliers that priced the usage's recorded
 * `costMicroUsd`: same `modelId`, `isBatch`, `serviceTier`, and inference region derived from
 * `region` (`null` prices as global). Only cache read and write adjustments are ignored.
 */
function getRunTokenRates(usage: RunUsageForAttribution): {
  inputCostMicroUsdPerToken: number;
  outputCostMicroUsdPerToken: number;
} {
  const promptTokensForRate = Math.max(usage.promptTokens, 1);
  const completionTokensForRate = Math.max(usage.completionTokens, 1);
  const inputCostMicroUsd = priceUsageTokens(usage, {
    promptTokens: promptTokensForRate,
    completionTokens: 0,
    cachedTokens: null,
    cacheCreationTokens: null,
  });
  const totalCostMicroUsd = priceUsageTokens(usage, {
    promptTokens: promptTokensForRate,
    completionTokens: completionTokensForRate,
    cachedTokens: null,
    cacheCreationTokens: null,
  });

  return {
    inputCostMicroUsdPerToken: inputCostMicroUsd / promptTokensForRate,
    outputCostMicroUsdPerToken:
      (totalCostMicroUsd - inputCostMicroUsd) / completionTokensForRate,
  };
}

// The recorded cost is stored as whole micro-dollars, so it can sit up to half a micro-dollar
// below its exact price.
const RECORDED_COST_ROUNDING_MICRO_USD = 0.5;

/**
 * @cc [owner:sfriquet,label:product] output-at-list-price
 * A call's output MUST be priced at its list price, and every cache discount or premium MUST go to
 * its input. The split MUST fail when the output alone costs more than the call's recorded cost,
 * beyond the rounding of the stored cost.
 */
export function splitRecordedCostIntoInputAndOutput(
  usage: RunUsageForAttribution & Pick<RunUsageWithRunKeyType, "costMicroUsd">
): Result<
  { inputCostMicroUsd: number; outputCostMicroUsd: number },
  "output_exceeds_recorded_cost"
> {
  const outputCostMicroUsd =
    usage.completionTokens * getRunTokenRates(usage).outputCostMicroUsdPerToken;
  if (
    outputCostMicroUsd >
    usage.costMicroUsd + RECORDED_COST_ROUNDING_MICRO_USD
  ) {
    return new Err("output_exceeds_recorded_cost");
  }

  return new Ok({
    inputCostMicroUsd: Math.max(usage.costMicroUsd - outputCostMicroUsd, 0),
    outputCostMicroUsd,
  });
}

export type CachedTokenPriceRatios = {
  cached: number;
  cacheWrite: number;
};

export function getCachedTokenPriceRatios(
  usage: RunUsageForAttribution
): CachedTokenPriceRatios {
  const promptTokens = Math.max(usage.promptTokens, 1);
  const pricePromptTokens = ({
    cachedTokens,
    cacheCreationTokens,
  }: {
    cachedTokens: number | null;
    cacheCreationTokens: number | null;
  }) =>
    priceUsageTokens(usage, {
      promptTokens,
      completionTokens: 0,
      cachedTokens,
      cacheCreationTokens,
    });
  const uncachedCostMicroUsd = pricePromptTokens({
    cachedTokens: null,
    cacheCreationTokens: null,
  });
  const ratioToUncached = (costMicroUsd: number) =>
    uncachedCostMicroUsd > 0 ? costMicroUsd / uncachedCostMicroUsd : 1;

  return {
    cached: ratioToUncached(
      pricePromptTokens({
        cachedTokens: promptTokens,
        cacheCreationTokens: null,
      })
    ),
    cacheWrite: ratioToUncached(
      pricePromptTokens({
        cachedTokens: null,
        cacheCreationTokens: promptTokens,
      })
    ),
  };
}

function attributedCreditsForTokens({
  tokensCount,
  costMicroUsdPerToken,
}: {
  tokensCount: number;
  costMicroUsdPerToken: number;
}): number {
  return creditAmountMicroFromCostMicroUsd(tokensCount * costMicroUsdPerToken);
}

/**
 * Scales local tool-call measurements proportionally when they exceed the exact provider output
 * budget. Any rounding remainder is assigned in input order for deterministic totals.
 */
function normalizeTokenMeasurements({
  availableTokensCount,
  measurements,
}: {
  availableTokensCount: number;
  measurements: number[];
}): number[] {
  const measuredTokensCount = measurements.reduce(
    (total, count) => total + count,
    0
  );
  if (
    measuredTokensCount === 0 ||
    measuredTokensCount <= availableTokensCount
  ) {
    return measurements;
  }

  const normalized = measurements.map((count) =>
    Math.floor((count * availableTokensCount) / measuredTokensCount)
  );
  let remainingTokensCount =
    availableTokensCount -
    normalized.reduce((total, count) => total + count, 0);

  for (
    let index = 0;
    index < normalized.length && remainingTokensCount > 0;
    index++
  ) {
    if (measurements[index] > 0) {
      normalized[index] += 1;
      remainingTokensCount -= 1;
    }
  }

  return normalized;
}

/**
 * Partitions one provider-reported RunUsage into semantic model and tool-call
 * contributions. Remaining non-reasoning tokens become assistant output.
 */
export function buildRunUsageAttribution<TTool>({
  usage,
  toolCalls,
}: {
  usage: RunUsageForAttribution;
  toolCalls: MeasuredToolCall<TTool>[];
}): RunUsageAttribution<TTool> {
  assertValidRunUsage(usage);
  for (const toolCall of toolCalls) {
    assertNonNegative(
      toolCall.measuredOutputTokensCount,
      "Measured tool output tokens must be non-negative"
    );
  }

  const rates = getRunTokenRates(usage);
  const reasoningTokensCount = usage.reasoningTokens ?? 0;
  const availableOutputTokensCount =
    usage.completionTokens - reasoningTokensCount;
  const toolOutputTokensCounts = normalizeTokenMeasurements({
    availableTokensCount: availableOutputTokensCount,
    measurements: toolCalls.map(
      (toolCall) => toolCall.measuredOutputTokensCount
    ),
  });
  const toolOutputTokensCount = toolOutputTokensCounts.reduce(
    (total, count) => total + count,
    0
  );
  const outputTokensCount = availableOutputTokensCount - toolOutputTokensCount;

  return {
    modelItems: [
      {
        itemType: "input",
        inputTokensCount: usage.promptTokens,
        grossAttributedCreditAmountMicro: attributedCreditsForTokens({
          tokensCount: usage.promptTokens,
          costMicroUsdPerToken: rates.inputCostMicroUsdPerToken,
        }),
      },
      {
        itemType: "output",
        outputTokensCount,
        grossAttributedCreditAmountMicro: attributedCreditsForTokens({
          tokensCount: outputTokensCount,
          costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
        }),
      },
      ...(usage.reasoningTokens !== null
        ? [
            {
              itemType: "reasoning" as const,
              outputTokensCount: reasoningTokensCount,
              grossAttributedCreditAmountMicro: attributedCreditsForTokens({
                tokensCount: reasoningTokensCount,
                costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
              }),
            },
          ]
        : []),
    ],
    toolCalls: toolCalls.map((toolCall, index) => {
      const outputTokensCount = toolOutputTokensCounts[index];
      return {
        tool: toolCall.tool,
        outputTokensCount,
        grossAttributedCreditAmountMicro: attributedCreditsForTokens({
          tokensCount: outputTokensCount,
          costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
        }),
      };
    }),
  };
}

/**
 * Combines the emitted tool call, produced result, and exact direct charge into one tool
 * attribution. The result footprint uses cache-naive input pricing.
 */
export function buildToolAttribution<TTool>({
  usage,
  toolCall,
  inputTokensCount,
  directCreditAmountMicro,
}: {
  usage: RunUsageForAttribution;
  toolCall: ToolCallAttribution<TTool>;
  inputTokensCount: number | null;
  directCreditAmountMicro: number | null;
}): ToolAttribution<TTool> {
  assertValidRunUsage(usage);
  assertNonNegative(
    toolCall.outputTokensCount,
    "Tool output tokens must be non-negative"
  );
  assertNonNegative(
    toolCall.grossAttributedCreditAmountMicro,
    "Tool gross attributed credit amount must be non-negative"
  );
  if (inputTokensCount !== null) {
    assertNonNegative(
      inputTokensCount,
      "Tool input tokens must be non-negative"
    );
  }
  if (directCreditAmountMicro !== null) {
    assertNonNegative(
      directCreditAmountMicro,
      "Direct credit amount must be non-negative"
    );
  }

  const inputCreditAmountMicro =
    inputTokensCount === null
      ? 0
      : attributedCreditsForTokens({
          tokensCount: inputTokensCount,
          costMicroUsdPerToken:
            getRunTokenRates(usage).inputCostMicroUsdPerToken,
        });

  return {
    ...toolCall,
    inputTokensCount,
    directCreditAmountMicro,
    grossAttributedCreditAmountMicro:
      toolCall.grossAttributedCreditAmountMicro +
      inputCreditAmountMicro +
      (directCreditAmountMicro ?? 0),
  };
}
