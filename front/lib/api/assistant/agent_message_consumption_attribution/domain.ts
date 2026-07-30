import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { CompletedAgentMessageConsumptionItem } from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  RunResource,
  RunUsageType,
} from "@app/lib/resources/run_resource";

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

export type ToolCallAttributionEvidence = {
  action: AgentMCPActionResource;
  runUsageModelId: RunUsageWithIdentity["runUsageModelId"];
  outputTokensCount: number;
  grossAttributedCreditAmountMicro: number;
};

export function buildRunAttribution({
  usage,
  actions,
  measuredToolOutputTokensCounts,
}: {
  usage: RunUsageWithIdentity;
  actions: AgentMCPActionResource[];
  measuredToolOutputTokensCounts: number[];
}): {
  completedItems: CompletedAgentMessageConsumptionItem[];
  toolCallEvidence: ToolCallAttributionEvidence[];
} {
  if (actions.length !== measuredToolOutputTokensCounts.length) {
    throw new Error("Tool actions and token measurements do not match");
  }

  const rates = getRunTokenRates(usage);
  const reasoningTokensCount = usage.reasoningTokens ?? 0;
  const availableTokensCount = Math.max(
    usage.completionTokens - reasoningTokensCount,
    0
  );
  const toolOutputTokensCounts = normalizeTokenMeasurements(
    measuredToolOutputTokensCounts,
    availableTokensCount
  );
  const toolOutputTokensCount = toolOutputTokensCounts.reduce(
    (total, count) => total + count,
    0
  );
  const outputTokensCount = availableTokensCount - toolOutputTokensCount;

  return {
    completedItems: [
      {
        itemType: "input",
        runUsageModelId: usage.runUsageModelId,
        inputTokensCount: usage.promptTokens,
        grossAttributedCreditAmountMicro: attributedCreditsForTokens({
          tokensCount: usage.promptTokens,
          costMicroUsdPerToken: rates.inputCostMicroUsdPerToken,
        }),
      },
      {
        itemType: "output",
        runUsageModelId: usage.runUsageModelId,
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
              runUsageModelId: usage.runUsageModelId,
              outputTokensCount: reasoningTokensCount,
              grossAttributedCreditAmountMicro: attributedCreditsForTokens({
                tokensCount: reasoningTokensCount,
                costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
              }),
            },
          ]
        : []),
    ],
    toolCallEvidence: actions.map((action, index) => {
      const outputTokensCount = toolOutputTokensCounts[index];
      return {
        action,
        runUsageModelId: usage.runUsageModelId,
        outputTokensCount,
        grossAttributedCreditAmountMicro: attributedCreditsForTokens({
          tokensCount: outputTokensCount,
          costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
        }),
      };
    }),
  };
}
