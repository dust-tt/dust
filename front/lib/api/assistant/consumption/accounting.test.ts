import {
  buildModelCallConsumption,
  sumModelCallConsumption,
} from "@app/lib/api/assistant/consumption/accounting";
import { describe, expect, it, vi } from "vitest";

const INPUT_RATE_MICRO_USD = 3;
const OUTPUT_RATE_MICRO_USD = 15;

vi.mock("@app/lib/api/assistant/token_pricing", () => ({
  computeTokensCostForUsageInMicroUsd: ({
    promptTokens,
    completionTokens,
  }: {
    promptTokens: number;
    completionTokens: number;
  }) =>
    promptTokens * INPUT_RATE_MICRO_USD +
    completionTokens * OUTPUT_RATE_MICRO_USD,
}));

function microCreditsFromMicroUsd(microUsd: number): number {
  return Math.round((microUsd * 1_000_000) / 8_500);
}

function usage({
  promptTokens,
  completionTokens,
  reasoningTokens = null,
  costMicroUsd,
}: {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number | null;
  costMicroUsd: number;
}) {
  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    modelId: "gpt-4o" as const,
    isBatch: false,
    costMicroUsd,
  };
}

describe("buildModelCallConsumption", () => {
  it("prices the design doc's first call, tool call carved out of output", () => {
    const exactMicroUsd = 2_000 * 3 + 300 * 15;
    const consumption = buildModelCallConsumption({
      usage: usage({
        promptTokens: 2_000,
        completionTokens: 300,
        costMicroUsd: exactMicroUsd,
      }),
      emittedToolCalls: [{ tool: "T", measuredOutputTokensCount: 100 }],
      consumedToolResults: [],
    });

    expect(consumption.exactCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(exactMicroUsd)
    );
    expect(consumption.output.reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(200 * 15)
    );
    expect(consumption.emittedToolCalls[0].reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(100 * 15)
    );
    expect(consumption.input.reconciledCreditAmountMicro).toBe(
      consumption.exactCreditAmountMicro -
        consumption.output.reconciledCreditAmountMicro -
        consumption.emittedToolCalls[0].reconciledCreditAmountMicro
    );
    expect(sumModelCallConsumption(consumption)).toBe(
      consumption.exactCreditAmountMicro
    );
  });

  it("debits a consumed tool result from the consuming call's input row", () => {
    const exactMicroUsd = 3_800 * 3 + 200 * 15;
    const consumption = buildModelCallConsumption({
      usage: usage({
        promptTokens: 3_800,
        completionTokens: 200,
        costMicroUsd: exactMicroUsd,
      }),
      emittedToolCalls: [],
      consumedToolResults: [{ tool: "T", resultTokensCount: 1_500 }],
    });

    expect(consumption.consumedToolResults[0].reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(1_500 * 3)
    );
    expect(consumption.input.reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(2_300 * 3)
    );
    expect(consumption.input.grossCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(3_800 * 3)
    );
    expect(sumModelCallConsumption(consumption)).toBe(
      consumption.exactCreditAmountMicro
    );
    expect(consumption.inputClampedByCaching).toBe(false);
  });

  it("keeps reasoning tokens out of the output row", () => {
    const exactMicroUsd = 1_000 * 3 + 500 * 15;
    const consumption = buildModelCallConsumption({
      usage: usage({
        promptTokens: 1_000,
        completionTokens: 500,
        reasoningTokens: 200,
        costMicroUsd: exactMicroUsd,
      }),
      emittedToolCalls: [],
      consumedToolResults: [],
    });

    expect(consumption.reasoning?.reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(200 * 15)
    );
    expect(consumption.output.reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(300 * 15)
    );
    expect(sumModelCallConsumption(consumption)).toBe(
      consumption.exactCreditAmountMicro
    );
  });

  it("lands the whole cache discount on the input row", () => {
    const exactMicroUsd = Math.round(3_800 * 3 * 0.5) + 200 * 15;
    const consumption = buildModelCallConsumption({
      usage: usage({
        promptTokens: 3_800,
        completionTokens: 200,
        costMicroUsd: exactMicroUsd,
      }),
      emittedToolCalls: [],
      consumedToolResults: [{ tool: "T", resultTokensCount: 1_500 }],
    });

    expect(consumption.output.reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(200 * 15)
    );
    expect(consumption.consumedToolResults[0].reconciledCreditAmountMicro).toBe(
      microCreditsFromMicroUsd(1_500 * 3)
    );
    expect(sumModelCallConsumption(consumption)).toBe(
      consumption.exactCreditAmountMicro
    );
    expect(consumption.inputClampedByCaching).toBe(false);
  });

  it("clamps the input row to zero and scales the results to fit", () => {
    const exactMicroUsd = Math.round(3_800 * 3 * 0.145) + 200 * 15;
    const consumption = buildModelCallConsumption({
      usage: usage({
        promptTokens: 3_800,
        completionTokens: 200,
        costMicroUsd: exactMicroUsd,
      }),
      emittedToolCalls: [],
      consumedToolResults: [
        { tool: "T1", resultTokensCount: 1_000 },
        { tool: "T2", resultTokensCount: 500 },
      ],
    });

    expect(consumption.inputClampedByCaching).toBe(true);
    expect(consumption.input.reconciledCreditAmountMicro).toBe(0);
    expect(sumModelCallConsumption(consumption)).toBe(
      consumption.exactCreditAmountMicro
    );
    expect(
      consumption.consumedToolResults[0].reconciledCreditAmountMicro
    ).toBeGreaterThan(
      consumption.consumedToolResults[1].reconciledCreditAmountMicro
    );
    for (const result of consumption.consumedToolResults) {
      expect(result.reconciledCreditAmountMicro).toBeLessThan(
        result.grossCreditAmountMicro
      );
    }
  });

  it("scales tool call footprints down to the provider's output budget", () => {
    const exactMicroUsd = 1_000 * 3 + 50 * 15;
    const consumption = buildModelCallConsumption({
      usage: usage({
        promptTokens: 1_000,
        completionTokens: 50,
        costMicroUsd: exactMicroUsd,
      }),
      emittedToolCalls: [
        { tool: "T1", measuredOutputTokensCount: 400 },
        { tool: "T2", measuredOutputTokensCount: 100 },
      ],
      consumedToolResults: [],
    });

    const callTokens = consumption.emittedToolCalls.reduce(
      (total, toolCall) => total + toolCall.outputTokensCount,
      0
    );
    expect(callTokens).toBe(50);
    expect(consumption.output.outputTokensCount).toBe(0);
    expect(sumModelCallConsumption(consumption)).toBe(
      consumption.exactCreditAmountMicro
    );
  });
});
