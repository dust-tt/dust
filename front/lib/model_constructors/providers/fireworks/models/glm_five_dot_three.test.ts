// @vitest-environment node

import { DustZAiGlmFiveDotThreeGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/z_ai_glm_five_dot_three_global_fireworks";
import { mapReasoningEffortToLowHighMax } from "@app/lib/llms/stream/types/configuration";
import { ZAiGlmFiveDotThreeGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_global_fireworks";
import { itKeepsLimitsAndPricingConsistent } from "@app/lib/model_constructors/test/model_limits";
import { FIREWORKS_GLM_5P3_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";
import { describe, expect, it } from "vitest";

describe("GLM-5.3 model configuration", () => {
  itKeepsLimitsAndPricingConsistent({
    streamEndpoint: ZAiGlmFiveDotThreeGlobalFireworksStream,
    dustStreamEndpoint: DustZAiGlmFiveDotThreeGlobalFireworksStream,
    modelConfig: FIREWORKS_GLM_5P3_MODEL_CONFIG,
    native: { contextSize: 1_048_576, maxOutputTokens: 131_072 },
    dust: { contextSize: 1_000_000, maxOutputTokens: 128_000 },
  });

  it("defaults to the documented `max` reasoning effort", () => {
    // Z.ai documents `max` as GLM-5.3's default, and an absent `reasoning`
    // would otherwise let the provider pick for us.
    const endpoint = new ZAiGlmFiveDotThreeGlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      ZAiGlmFiveDotThreeGlobalFireworksStream.configSchema.parse({})
    );

    expect(payload.reasoning).toEqual({ effort: "max", summary: "auto" });
  });

  it("folds Dust's reasoning ladder onto the native efforts", () => {
    expect(DustZAiGlmFiveDotThreeGlobalFireworksStream.configParsers).toEqual([
      mapReasoningEffortToLowHighMax,
    ]);
  });

  it("keeps the thinking-only contract agreed between the config and the schema", () => {
    // GLM-5.3 is thinking-only, so offering a `none` tier in the product would
    // reach the endpoint and fail validation. Nothing else cross-checks the
    // legacy config against the schema, so pin the pair.
    expect(FIREWORKS_GLM_5P3_MODEL_CONFIG.supportedReasoningEfforts.none).toBe(
      false
    );
    expect(
      ZAiGlmFiveDotThreeGlobalFireworksStream.configSchema.safeParse({
        reasoning: { effort: "none" },
      }).success
    ).toBe(false);
  });
});
