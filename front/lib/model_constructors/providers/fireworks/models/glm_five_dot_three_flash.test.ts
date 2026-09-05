// @vitest-environment node

import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing";
import { DustZAiGlmFiveDotThreeFlashGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks";
import { ZAiGlmFiveDotThreeFlashGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/z_ai_glm_five_dot_three_flash_global_fireworks";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import {
  FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG,
  FIREWORKS_GLM_5P3_FLASH_MODEL_ID,
} from "@app/types/assistant/models/fireworks";
import { describe, expect, it } from "vitest";

const NATIVE_CONTEXT_SIZE = 1_048_576;
const NATIVE_MAX_OUTPUT_TOKENS = 131_072;
const DUST_CONTEXT_SIZE = 256_000;
const DUST_MAX_OUTPUT_TOKENS = 64_000;

describe("GLM-5.3 Flash model configuration", () => {
  it("keeps the native limits on the model_constructors endpoint", () => {
    expect(ZAiGlmFiveDotThreeFlashGlobalFireworksStream.contextSize).toBe(
      NATIVE_CONTEXT_SIZE
    );
    expect(ZAiGlmFiveDotThreeFlashGlobalFireworksStream.maxOutputTokens).toBe(
      NATIVE_MAX_OUTPUT_TOKENS
    );
  });

  it("caps context and output in the Dust layer", () => {
    expect(DustZAiGlmFiveDotThreeFlashGlobalFireworksStream.contextSize).toBe(
      DUST_CONTEXT_SIZE
    );
    expect(
      DustZAiGlmFiveDotThreeFlashGlobalFireworksStream.maxOutputTokens
    ).toBe(DUST_MAX_OUTPUT_TOKENS);
    expect(FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG.contextSize).toBe(
      DUST_CONTEXT_SIZE
    );
    expect(FIREWORKS_GLM_5P3_FLASH_MODEL_CONFIG.generationTokensCount).toBe(
      DUST_MAX_OUTPUT_TOKENS
    );
  });

  it("uses the Fireworks model path and published pricing", () => {
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
    expect(ZAiGlmFiveDotThreeFlashGlobalFireworksStream.tokenPricing).toEqual({
      cacheHit: 0.029,
      standardInput: 0.15,
      standardOutput: 0.5,
    });
    expect(MODEL_PRICING[FIREWORKS_GLM_5P3_FLASH_MODEL_ID]).toEqual({
      input: 0.15,
      output: 0.5,
      cache_read_input_tokens: 0.029,
    });
  });

  it("maps Dust's reasoning ladder onto low, high, and max", () => {
    const parseConfig = (config: InputConfig) =>
      DustZAiGlmFiveDotThreeFlashGlobalFireworksStream.configParsers.reduce(
        (currentConfig, parser) => parser(currentConfig),
        config
      );

    expect(parseConfig({ reasoning: { effort: "low" } }).reasoning).toEqual({
      effort: "low",
    });
    expect(parseConfig({ reasoning: { effort: "medium" } }).reasoning).toEqual({
      effort: "high",
    });
    expect(parseConfig({ reasoning: { effort: "high" } }).reasoning).toEqual({
      effort: "maximal",
    });
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
