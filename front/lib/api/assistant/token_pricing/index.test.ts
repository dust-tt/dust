import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import {
  GROK_4_5_MODEL_ID,
  GROK_4_6_MODEL_ID,
} from "@app/types/assistant/models/xai";
import { describe, expect, it } from "vitest";

describe("computeTokensCostForUsageInMicroUsd", () => {
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
