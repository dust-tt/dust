import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing";
import {
  getBlendedModelCostUsdPerMillionTokens,
  getModelsAllowedForTier,
  getModelTier,
  getModelTierForBlendedCost,
  groupModelsByTier,
  MODEL_PICKER_STATIC_MODEL_IDS,
  MODEL_TIER_BLENDED_COST_THRESHOLDS_USD,
  MODEL_TIERS,
} from "@app/lib/api/models_picker/tiers";
import { describe, expect, it } from "vitest";

describe("getModelTierForBlendedCost", () => {
  it("maps blended costs to the four pricing tiers", () => {
    expect(getModelTierForBlendedCost(0.1)).toBe("fast");
    expect(
      getModelTierForBlendedCost(
        MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.balanced - 0.01
      )
    ).toBe("fast");
    expect(
      getModelTierForBlendedCost(
        MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.balanced
      )
    ).toBe("balanced");
    expect(
      getModelTierForBlendedCost(
        MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.powerful - 0.01
      )
    ).toBe("balanced");
    expect(
      getModelTierForBlendedCost(
        MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.powerful
      )
    ).toBe("powerful");
    expect(
      getModelTierForBlendedCost(
        MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.frontier - 0.01
      )
    ).toBe("powerful");
    expect(
      getModelTierForBlendedCost(
        MODEL_TIER_BLENDED_COST_THRESHOLDS_USD.frontier
      )
    ).toBe("frontier");
  });
});

describe("getModelTier", () => {
  it("classifies representative models from the pricing table", () => {
    expect(getModelTier("accounts/fireworks/models/glm-5")).toBe("fast");
    expect(getModelTier("gemini-2.5-flash-lite")).toBe("fast");
    expect(getModelTier("gpt-5-nano")).toBe("fast");

    expect(getModelTier("gpt-5-mini")).toBe("balanced");
    expect(getModelTier("gemini-3-flash-preview")).toBe("balanced");

    expect(getModelTier("gpt-5.4")).toBe("powerful");
    expect(getModelTier("claude-sonnet-4-6")).toBe("powerful");

    expect(getModelTier("gpt-5.5")).toBe("frontier");
    expect(getModelTier("claude-4-opus-20250514")).toBe("frontier");
  });
});

describe("groupModelsByTier", () => {
  it("assigns every picker model to exactly one tier", () => {
    const grouped = groupModelsByTier();
    const assignedModels = MODEL_TIERS.flatMap((tier) => grouped[tier]);

    expect(assignedModels).toHaveLength(MODEL_PICKER_STATIC_MODEL_IDS.length);
    expect(new Set(assignedModels)).toEqual(
      new Set(MODEL_PICKER_STATIC_MODEL_IDS)
    );
  });

  it("keeps models in the tier returned by getModelTier", () => {
    const grouped = groupModelsByTier();

    for (const tier of MODEL_TIERS) {
      for (const modelId of grouped[tier]) {
        expect(getModelTier(modelId)).toBe(tier);
      }
    }
  });
});

describe("getModelsAllowedForTier", () => {
  it("returns cumulative allowlists up to the selected ceiling", () => {
    const grouped = groupModelsByTier();

    expect(getModelsAllowedForTier("fast")).toEqual(
      expect.arrayContaining(grouped.fast)
    );
    expect(getModelsAllowedForTier("fast")).toHaveLength(grouped.fast.length);

    expect(getModelsAllowedForTier("balanced")).toEqual(
      expect.arrayContaining([...grouped.fast, ...grouped.balanced])
    );
    expect(getModelsAllowedForTier("balanced")).toHaveLength(
      grouped.fast.length + grouped.balanced.length
    );

    expect(getModelsAllowedForTier("powerful")).toHaveLength(
      grouped.fast.length + grouped.balanced.length + grouped.powerful.length
    );

    expect(getModelsAllowedForTier("frontier")).toEqual(
      expect.arrayContaining(MODEL_PICKER_STATIC_MODEL_IDS)
    );
    expect(getModelsAllowedForTier("frontier")).toHaveLength(
      MODEL_PICKER_STATIC_MODEL_IDS.length
    );
  });

  it("never includes models above the selected tier", () => {
    const tierRank = Object.fromEntries(
      MODEL_TIERS.map((tier, index) => [tier, index])
    ) as Record<(typeof MODEL_TIERS)[number], number>;

    for (const maxTier of MODEL_TIERS) {
      const allowed = getModelsAllowedForTier(maxTier);

      for (const modelId of allowed) {
        expect(tierRank[getModelTier(modelId)]).toBeLessThanOrEqual(
          tierRank[maxTier]
        );
      }
    }
  });
});

describe("getBlendedModelCostUsdPerMillionTokens", () => {
  it("averages input and output pricing", () => {
    const pricing = MODEL_PRICING["gpt-5-nano"];
    expect(getBlendedModelCostUsdPerMillionTokens(pricing)).toBe(0.225);
  });
});
