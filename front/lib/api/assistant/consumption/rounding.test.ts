import { computeGroupedModelCreditAmount } from "@app/lib/api/assistant/consumption/rounding";
import { describe, expect, it } from "vitest";

describe("computeGroupedModelCreditAmount", () => {
  it("sums calls before rounding within a provider/model group", () => {
    expect(
      computeGroupedModelCreditAmount({
        modelPostings: [
          {
            consumptionItemId: 1,
            runUsageModelId: 11,
            creditAmountMicro: 400_000,
          },
          {
            consumptionItemId: 2,
            runUsageModelId: 12,
            creditAmountMicro: 400_000,
          },
        ],
        usageGroups: [
          { runUsageModelId: 11, providerId: "openai", modelId: "gpt" },
          { runUsageModelId: 12, providerId: "openai", modelId: "gpt" },
        ],
      })
    ).toBe(1);
  });

  it("rounds different provider/model groups independently", () => {
    expect(
      computeGroupedModelCreditAmount({
        modelPostings: [
          {
            consumptionItemId: 1,
            runUsageModelId: 11,
            creditAmountMicro: 400_000,
          },
          {
            consumptionItemId: 2,
            runUsageModelId: 12,
            creditAmountMicro: 400_000,
          },
        ],
        usageGroups: [
          { runUsageModelId: 11, providerId: "openai", modelId: "gpt" },
          { runUsageModelId: 12, providerId: "anthropic", modelId: "claude" },
        ],
      })
    ).toBe(2);
  });

  it("fails when billing metadata is incomplete", () => {
    expect(() =>
      computeGroupedModelCreditAmount({
        modelPostings: [
          { consumptionItemId: 1, runUsageModelId: 11, creditAmountMicro: 1 },
        ],
        usageGroups: [],
      })
    ).toThrow("Missing run usage 11 for consumption item 1");
  });
});
