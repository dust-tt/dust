import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import { EU_UPLIFT_MODEL_IDS } from "@app/lib/api/assistant/token_pricing/eu";
import {
  GPT_5_5_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  GPT_5_MODEL_ID,
} from "@app/types/assistant/models/openai";
import {
  GROK_4_5_MODEL_ID,
  GROK_4_6_MODEL_ID,
} from "@app/types/assistant/models/xai";
import { describe, expect, it } from "vitest";

describe("computeTokensCostForUsageInMicroUsd", () => {
  it.each(
    EU_UPLIFT_MODEL_IDS
  )("applies the EU uplift to every token rate for %s", (modelId) => {
    const usage = {
      modelId,
      promptTokens: 4_000_000,
      completionTokens: 1_000_000,
      cachedTokens: 1_000_000,
      cacheCreationTokens: 2_000_000,
      longCacheCreationTokens: 1_000_000,
    };

    const globalCostMicroUsd = computeTokensCostForUsageInMicroUsd({
      ...usage,
      inferenceRegion: "global",
    });
    const euCostMicroUsd = computeTokensCostForUsageInMicroUsd({
      ...usage,
      inferenceRegion: "eu",
    });

    expect(euCostMicroUsd).toBeCloseTo(globalCostMicroUsd * 1.1, 6);
  });

  it("combines the OpenAI EU uplift with the batch discount", () => {
    const usage = {
      modelId: GPT_5_5_MODEL_ID,
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cachedTokens: null,
      isBatch: true,
    };

    expect(
      computeTokensCostForUsageInMicroUsd({
        ...usage,
        inferenceRegion: "global",
      })
    ).toBe(17_500_000);
    expect(
      computeTokensCostForUsageInMicroUsd({
        ...usage,
        inferenceRegion: "eu",
      })
    ).toBe(19_250_000);
  });

  it("does not uplift OpenAI models without regional premium pricing", () => {
    const usage = {
      modelId: GPT_5_MODEL_ID,
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cachedTokens: null,
    };

    expect(
      computeTokensCostForUsageInMicroUsd({
        ...usage,
        inferenceRegion: "eu",
      })
    ).toBe(
      computeTokensCostForUsageInMicroUsd({
        ...usage,
        inferenceRegion: "global",
      })
    );
  });

  it("uses standard Terra pricing through 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
        promptTokens: 272_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(556_000);
  });

  it("uses Terra long-context pricing above 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
        promptTokens: 272_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(1_106_004);
  });

  it("uses long-context cache rates with the EU uplift", () => {
    const usage = {
      modelId: GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
      promptTokens: 272_001,
      completionTokens: 1_000,
      cachedTokens: 100_000,
      cacheCreationTokens: 100_000,
    };
    const globalCostMicroUsd = computeTokensCostForUsageInMicroUsd({
      ...usage,
      inferenceRegion: "global",
    });
    const euCostMicroUsd = computeTokensCostForUsageInMicroUsd({
      ...usage,
      inferenceRegion: "eu",
    });

    expect(globalCostMicroUsd).toBe(846_004);
    expect(euCostMicroUsd).toBeCloseTo(globalCostMicroUsd * 1.1, 6);
  });

  it("uses long-context Grok 4.5 pricing at 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GROK_4_5_MODEL_ID,
        promptTokens: 200_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(812_000);
  });

  it("uses long-context Grok 4.5 pricing above 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GROK_4_5_MODEL_ID,
        promptTokens: 200_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(812_004);
  });

  it("uses long-context cached input pricing above the threshold", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GROK_4_5_MODEL_ID,
        promptTokens: 200_001,
        completionTokens: 0,
        cachedTokens: 100_000,
      })
    ).toBe(460_004);
  });

  it("uses Grok 4.6 long-context cached input pricing at 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GROK_4_6_MODEL_ID,
        promptTokens: 200_000,
        completionTokens: 1_000,
        cachedTokens: 100_000,
      })
    ).toBe(512_000);
  });

  it("uses Grok 4.6 long-context pricing above 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GROK_4_6_MODEL_ID,
        promptTokens: 200_001,
        completionTokens: 1_000,
        cachedTokens: 100_000,
      })
    ).toBe(512_004);
  });
});
