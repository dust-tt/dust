import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemCreate } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageType,
} from "@app/lib/resources/run_resource";
import type { ModelId } from "@app/types/shared/model_id";

export const AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION = 1;
const CREDIT_AMOUNT_MICRO_PER_CREDIT = 1_000_000;

const MODEL_COST_MICRO_USD_PER_CREDIT = 8_500;

export type RunUsageWithIdentity = Awaited<
  ReturnType<typeof RunResource.listRunUsagesForRuns>
>[number];

export type RunTokenRates = {
  inputCostMicroUsdPerToken: number;
  outputCostMicroUsdPerToken: number;
};

function creditAmountMicroFromCostMicroUsd(costMicroUsd: number): number {
  return Math.round(
    (costMicroUsd * CREDIT_AMOUNT_MICRO_PER_CREDIT) /
      MODEL_COST_MICRO_USD_PER_CREDIT
  );
}

export function getRunTokenRates(usage: RunUsageType): RunTokenRates {
  const promptTokensForRate = Math.max(usage.promptTokens, 1);
  const completionTokensForRate = Math.max(usage.completionTokens, 1);
  const inputCostMicroUsd = computeTokensCostForUsageInMicroUsd({
    modelId: usage.modelId,
    promptTokens: promptTokensForRate,
    completionTokens: 0,
    cachedTokens: null,
    cacheCreationTokens: null,
    isBatch: usage.isBatch,
  });
  const totalCostMicroUsd = computeTokensCostForUsageInMicroUsd({
    modelId: usage.modelId,
    promptTokens: promptTokensForRate,
    completionTokens: completionTokensForRate,
    cachedTokens: null,
    cacheCreationTokens: null,
    isBatch: usage.isBatch,
  });

  return {
    inputCostMicroUsdPerToken: inputCostMicroUsd / promptTokensForRate,
    outputCostMicroUsdPerToken:
      (totalCostMicroUsd - inputCostMicroUsd) / completionTokensForRate,
  };
}

export function attributedCreditsForTokens({
  tokensCount,
  costMicroUsdPerToken,
}: {
  tokensCount: number;
  costMicroUsdPerToken: number;
}): number {
  return creditAmountMicroFromCostMicroUsd(tokensCount * costMicroUsdPerToken);
}

export function normalizeTokenMeasurements(
  measurements: number[],
  availableTokensCount: number
): number[] {
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

  const scaled = measurements.map((count) =>
    Math.floor((count * availableTokensCount) / measuredTokensCount)
  );
  let remainingTokensCount =
    availableTokensCount - scaled.reduce((total, count) => total + count, 0);

  for (
    let index = 0;
    index < scaled.length && remainingTokensCount > 0;
    index++
  ) {
    if (measurements[index] > 0) {
      scaled[index] += 1;
      remainingTokensCount -= 1;
    }
  }

  return scaled;
}

export function serializeToolCallForAttribution(
  action: AgentMCPActionResource
): string {
  return JSON.stringify({
    name: action.functionCallName,
    arguments: action.stepContent.value.value.arguments,
  });
}

export function serializeToolResultForAttribution({
  action,
  output,
}: {
  action: AgentMCPActionResource;
  output: unknown[];
}): string {
  return JSON.stringify({
    name: action.functionCallName,
    result: output,
  });
}

export function buildPendingRunAttributionItems({
  conversationModelId,
  agentMessageModelId,
  usage,
}: {
  conversationModelId: ModelId;
  agentMessageModelId: ModelId;
  usage: RunUsageWithIdentity;
}): AgentMessageConsumptionItemCreate[] {
  const rates = getRunTokenRates(usage);
  const reasoningTokensCount = usage.reasoningTokens ?? 0;

  return [
    {
      conversationId: conversationModelId,
      agentMessageId: agentMessageModelId,
      runUsageId: usage.runUsageModelId,
      agentMCPActionId: null,
      itemKey: `run-usage:${usage.runUsageModelId}:input`,
      itemType: "input",
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      inputTokensCount: usage.promptTokens,
      outputTokensCount: null,
      grossAttributedCreditAmountMicro: attributedCreditsForTokens({
        tokensCount: usage.promptTokens,
        costMicroUsdPerToken: rates.inputCostMicroUsdPerToken,
      }),
      directCreditAmountMicro: null,
      completedAt: new Date(),
    },
    {
      conversationId: conversationModelId,
      agentMessageId: agentMessageModelId,
      runUsageId: usage.runUsageModelId,
      agentMCPActionId: null,
      itemKey: `run-usage:${usage.runUsageModelId}:output`,
      itemType: "output",
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      inputTokensCount: null,
      outputTokensCount: null,
      grossAttributedCreditAmountMicro: 0,
      directCreditAmountMicro: null,
      completedAt: null,
    },
    ...(usage.reasoningTokens !== null
      ? [
          {
            conversationId: conversationModelId,
            agentMessageId: agentMessageModelId,
            runUsageId: usage.runUsageModelId,
            agentMCPActionId: null,
            itemKey: `run-usage:${usage.runUsageModelId}:reasoning`,
            itemType: "reasoning" as const,
            attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
            inputTokensCount: null,
            outputTokensCount: reasoningTokensCount,
            grossAttributedCreditAmountMicro: attributedCreditsForTokens({
              tokensCount: reasoningTokensCount,
              costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
            }),
            directCreditAmountMicro: null,
            completedAt: new Date(),
          },
        ]
      : []),
  ];
}
