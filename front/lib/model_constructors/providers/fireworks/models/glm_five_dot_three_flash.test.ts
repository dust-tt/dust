// @vitest-environment node

import { DustZAiGlmFiveDotThreeFlashGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks";
import { mapReasoningEffortToLowHighMax } from "@app/lib/llms/stream/types/configuration";
import { ZAiGlmFiveDotThreeFlashGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks";
import { itKeepsLimitsAndPricingConsistent } from "@app/lib/model_constructors/test/model_limits";
import {
  FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG,
  FIREWORKS_GLM_5P3_FLASH_MODEL_ID,
} from "@app/types/assistant/models/fireworks";
import { describe, expect, it } from "vitest";

describe("GLM-5.3 Flash model configuration", () => {
  itKeepsLimitsAndPricingConsistent({
    streamEndpoint: ZAiGlmFiveDotThreeFlashGlobalFireworksStream,
    dustStreamEndpoint: DustZAiGlmFiveDotThreeFlashGlobalFireworksStream,
    modelConfig: FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG,
    native: { contextSize: 1_048_576, maxOutputTokens: 131_072 },
    dust: { contextSize: 256_000, maxOutputTokens: 64_000 },
  });
  it("uses the Fireworks model path and the documented reasoning default", () => {
    const endpoint = new ZAiGlmFiveDotThreeFlashGlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      ZAiGlmFiveDotThreeFlashGlobalFireworksStream.configSchema.parse({})
    );

    expect(payload.model).toBe(FIREWORKS_GLM_5P3_FLASH_MODEL_ID);
    expect(payload.reasoning).toEqual({ effort: "max", summary: "auto" });
    expect(payload.tool_choice).toBe("auto");
  });

  it("folds Dust's reasoning ladder onto the native efforts", () => {
    expect(
      DustZAiGlmFiveDotThreeFlashGlobalFireworksStream.configParsers
    ).toEqual([mapReasoningEffortToLowHighMax]);
  });

  it("exposes always-on reasoning and automatic tool choice only", () => {
    expect(
      FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG.supportedReasoningEfforts
    ).toEqual({
      none: false,
      light: true,
      medium: true,
      high: true,
    });
    expect(FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG.useNativeLightReasoning).toBe(
      true
    );
    expect(
      ZAiGlmFiveDotThreeFlashGlobalFireworksStream.configSchema.safeParse({
        forceTool: "calculator",
      }).success
    ).toBe(false);
    expect(
      FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG.availableIfOneOf
    ).toBeUndefined();
  });
});
