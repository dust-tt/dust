import type { RunUsageForAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import {
  buildRunUsageAttribution,
  creditAmountMicroFromCostMicroUsd,
  creditsForInputTokens,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

export type ConsumedToolResult<TTool> = {
  tool: TTool;
  resultTokensCount: number;
};

export type MeasuredToolCall<TTool> = {
  tool: TTool;
  measuredOutputTokensCount: number;
};

type ConsumptionAmounts = {
  grossCreditAmountMicro: number;
  reconciledCreditAmountMicro: number;
};

export type ModelCallConsumption<TCall, TResult> = {
  input: ConsumptionAmounts & { inputTokensCount: number };
  output: ConsumptionAmounts & { outputTokensCount: number };
  reasoning: (ConsumptionAmounts & { outputTokensCount: number }) | null;
  emittedToolCalls: (ConsumptionAmounts & {
    tool: TCall;
    outputTokensCount: number;
  })[];
  consumedToolResults: (ConsumptionAmounts & {
    tool: TResult;
    inputTokensCount: number;
  })[];
  exactCreditAmountMicro: number;
  inputClampedByCaching: boolean;
};

function distributeByWeight({
  total,
  weights,
}: {
  total: number;
  weights: number[];
}): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal === 0) {
    return weights.map(() => 0);
  }

  const shares = weights.map((weight, index) => {
    const exact = (weight * total) / weightTotal;
    const floor = Math.floor(exact);

    return { index, floor, fraction: exact - floor };
  });
  const remainder = total - shares.reduce((sum, share) => sum + share.floor, 0);
  const indexesReceivingRemainder = new Set(
    [...shares]
      .sort(
        (left, right) =>
          right.fraction - left.fraction || left.index - right.index
      )
      .slice(0, remainder)
      .map((share) => share.index)
  );

  return shares.map(
    ({ index, floor }) => floor + (indexesReceivingRemainder.has(index) ? 1 : 0)
  );
}

export function buildModelCallConsumption<TCall, TResult>({
  usage,
  emittedToolCalls,
  consumedToolResults,
}: {
  usage: RunUsageForAttribution & { costMicroUsd: number };
  emittedToolCalls: MeasuredToolCall<TCall>[];
  consumedToolResults: ConsumedToolResult<TResult>[];
}): ModelCallConsumption<TCall, TResult> {
  const exactCreditAmountMicro = creditAmountMicroFromCostMicroUsd(
    usage.costMicroUsd
  );

  const { modelItems, toolCalls } = buildRunUsageAttribution({
    usage,
    toolCalls: emittedToolCalls,
  });

  let inputItem: (typeof modelItems)[number] | null = null;
  let outputItem: (typeof modelItems)[number] | null = null;
  let reasoningItem: (typeof modelItems)[number] | null = null;
  for (const item of modelItems) {
    switch (item.itemType) {
      case "input":
        inputItem = item;
        break;
      case "output":
        outputItem = item;
        break;
      case "reasoning":
        reasoningItem = item;
        break;
      default:
        assertNever(item);
    }
  }
  assert(
    inputItem?.itemType === "input" && outputItem?.itemType === "output",
    "A model call always has an input and an output row"
  );

  const resultCreditAmountsMicro = consumedToolResults.map((result) =>
    creditsForInputTokens({ usage, tokensCount: result.resultTokensCount })
  );
  const exactOutputSideCreditAmountMicro =
    outputItem.grossAttributedCreditAmountMicro +
    (reasoningItem?.grossAttributedCreditAmountMicro ?? 0) +
    toolCalls.reduce(
      (total, toolCall) => total + toolCall.grossAttributedCreditAmountMicro,
      0
    );

  const inputSideCreditAmountMicro =
    exactCreditAmountMicro - exactOutputSideCreditAmountMicro;
  const resultCreditAmountMicro = resultCreditAmountsMicro.reduce(
    (total, amount) => total + amount,
    0
  );
  const inputCreditAmountMicro =
    inputSideCreditAmountMicro - resultCreditAmountMicro;

  const inputClampedByCaching = inputCreditAmountMicro < 0;
  const reconciledResultCreditAmountsMicro = inputClampedByCaching
    ? distributeByWeight({
        total: Math.max(inputSideCreditAmountMicro, 0),
        weights: resultCreditAmountsMicro,
      })
    : resultCreditAmountsMicro;

  return {
    input: {
      inputTokensCount: inputItem.inputTokensCount,
      grossCreditAmountMicro: inputItem.grossAttributedCreditAmountMicro,
      reconciledCreditAmountMicro: inputClampedByCaching
        ? 0
        : inputCreditAmountMicro,
    },
    output: {
      outputTokensCount: outputItem.outputTokensCount,
      grossCreditAmountMicro: outputItem.grossAttributedCreditAmountMicro,
      reconciledCreditAmountMicro: outputItem.grossAttributedCreditAmountMicro,
    },
    reasoning:
      reasoningItem?.itemType === "reasoning"
        ? {
            outputTokensCount: reasoningItem.outputTokensCount,
            grossCreditAmountMicro:
              reasoningItem.grossAttributedCreditAmountMicro,
            reconciledCreditAmountMicro:
              reasoningItem.grossAttributedCreditAmountMicro,
          }
        : null,
    emittedToolCalls: toolCalls.map((toolCall) => ({
      tool: toolCall.tool,
      outputTokensCount: toolCall.outputTokensCount,
      grossCreditAmountMicro: toolCall.grossAttributedCreditAmountMicro,
      reconciledCreditAmountMicro: toolCall.grossAttributedCreditAmountMicro,
    })),
    consumedToolResults: consumedToolResults.map((result, index) => ({
      tool: result.tool,
      inputTokensCount: result.resultTokensCount,
      grossCreditAmountMicro: resultCreditAmountsMicro[index],
      reconciledCreditAmountMicro: reconciledResultCreditAmountsMicro[index],
    })),
    exactCreditAmountMicro,
    inputClampedByCaching,
  };
}

export function sumModelCallConsumption<TCall, TResult>(
  consumption: ModelCallConsumption<TCall, TResult>
): number {
  return (
    consumption.input.reconciledCreditAmountMicro +
    consumption.output.reconciledCreditAmountMicro +
    (consumption.reasoning?.reconciledCreditAmountMicro ?? 0) +
    consumption.emittedToolCalls.reduce(
      (total, toolCall) => total + toolCall.reconciledCreditAmountMicro,
      0
    ) +
    consumption.consumedToolResults.reduce(
      (total, result) => total + result.reconciledCreditAmountMicro,
      0
    )
  );
}
