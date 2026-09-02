import {
  computeTokensCostForUsageInMicroUsd,
  FLEX_DISCOUNT_FACTOR,
} from "@app/lib/api/assistant/token_pricing";
import { EU_UPLIFT_MODEL_IDS } from "@app/lib/api/assistant/token_pricing/eu";
import {
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_PRO_MODEL_ID,
} from "@app/types/assistant/models/google_ai_studio";
import {
  GPT_5_4_MODEL_ID,
  GPT_5_5_MODEL_ID,
  GPT_5_6_LUNA_MODEL_ID,
  GPT_5_6_SOL_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  GPT_5_6_TERRA_MODEL_ID,
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
      // Kept below the long-context threshold so this only exercises uplift and batch.
      promptTokens: 200_000,
      completionTokens: 1_000_000,
      cachedTokens: null,
      isBatch: true,
    };

    expect(
      computeTokensCostForUsageInMicroUsd({
        ...usage,
        inferenceRegion: "global",
      })
    ).toBe(15_500_000);
    expect(
      computeTokensCostForUsageInMicroUsd({
        ...usage,
        inferenceRegion: "eu",
      })
    ).toBe(17_050_000);
  });

  it("halves every rate when the provider served the request on flex", () => {
    const usage = {
      modelId: GPT_5_MODEL_ID,
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cachedTokens: 200_000,
      cacheCreationTokens: 300_000,
    };

    const standardCostMicroUsd = 11_025_000;

    expect(computeTokensCostForUsageInMicroUsd(usage)).toBe(
      standardCostMicroUsd
    );
    expect(
      computeTokensCostForUsageInMicroUsd({ ...usage, serviceTier: "flex" })
    ).toBe(standardCostMicroUsd * FLEX_DISCOUNT_FACTOR);
    expect(
      computeTokensCostForUsageInMicroUsd({ ...usage, serviceTier: "default" })
    ).toBe(standardCostMicroUsd);
  });

  it("keeps the batch discount when a batch response also reports a tier", () => {
    const usage = {
      modelId: GPT_5_MODEL_ID,
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      cachedTokens: null,
    };

    expect(
      computeTokensCostForUsageInMicroUsd({
        ...usage,
        isBatch: true,
        serviceTier: "flex",
      })
    ).toBe(computeTokensCostForUsageInMicroUsd({ ...usage, isBatch: true }));
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

  it("uses standard GPT 5.4 pricing through 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_4_MODEL_ID,
        promptTokens: 272_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(695_000);
  });

  it("uses GPT 5.4 long-context pricing above 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_4_MODEL_ID,
        promptTokens: 272_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(1_382_505);
  });

  it("uses standard GPT 5.5 pricing through 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_5_MODEL_ID,
        promptTokens: 272_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(1_390_000);
  });

  it("uses GPT 5.5 long-context pricing above 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_5_MODEL_ID,
        promptTokens: 272_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(2_765_010);
  });

  it("uses GPT 5.5 long-context cached input pricing with the EU uplift", () => {
    const usage = {
      modelId: GPT_5_5_MODEL_ID,
      promptTokens: 272_001,
      completionTokens: 1_000,
      cachedTokens: 100_000,
    };
    const globalCostMicroUsd = computeTokensCostForUsageInMicroUsd({
      ...usage,
      inferenceRegion: "global",
    });
    const euCostMicroUsd = computeTokensCostForUsageInMicroUsd({
      ...usage,
      inferenceRegion: "eu",
    });

    expect(globalCostMicroUsd).toBe(1_865_010);
    expect(euCostMicroUsd).toBeCloseTo(globalCostMicroUsd * 1.1, 6);
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

  it("uses standard Sol pricing through 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_SOL_MODEL_ID,
        promptTokens: 272_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(1_108_000);
  });

  it("uses Sol long-context pricing above 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_SOL_MODEL_ID,
        promptTokens: 272_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(2_206_008);
  });

  it("uses standard base Terra pricing through 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_TERRA_MODEL_ID,
        promptTokens: 272_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(556_000);
  });

  it("uses base Terra long-context pricing above 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_TERRA_MODEL_ID,
        promptTokens: 272_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(1_106_004);
  });

  it("uses standard Luna pricing through 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_LUNA_MODEL_ID,
        promptTokens: 272_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBeCloseTo(55_600, 6);
  });

  it("uses Luna long-context pricing above 272k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GPT_5_6_LUNA_MODEL_ID,
        promptTokens: 272_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBeCloseTo(110_600.4, 6);
  });

  it("uses standard Gemini 3 Pro pricing through 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GEMINI_3_PRO_MODEL_ID,
        promptTokens: 200_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(412_000);
  });

  it("uses Gemini 3 Pro long-context pricing above 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GEMINI_3_PRO_MODEL_ID,
        promptTokens: 200_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(818_004);
  });

  it("uses standard Gemini 3.1 Pro pricing through 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GEMINI_3_1_PRO_MODEL_ID,
        promptTokens: 200_000,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(412_000);
  });

  it("uses Gemini 3.1 Pro long-context pricing above 200k prompt tokens", () => {
    expect(
      computeTokensCostForUsageInMicroUsd({
        modelId: GEMINI_3_1_PRO_MODEL_ID,
        promptTokens: 200_001,
        completionTokens: 1_000,
        cachedTokens: null,
      })
    ).toBe(818_004);
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
