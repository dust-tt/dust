// @vitest-environment node

import { DustDeepSeekDeepSeekV4ProGlobalFireworksStream } from "@app/lib/llms/stream/endpoints/deepseek_deepseek_v4_pro_global_fireworks";
import { DeepSeekDeepSeekV4ProGlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/deepseek_deepseek_v4_pro_global_fireworks";
import { FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";
import { describe, expect, it } from "vitest";

const NATIVE_CONTEXT_SIZE = 1_048_576;
const NATIVE_MAX_OUTPUT_TOKENS = 384_000;

const EXPECTED_CONTEXT_SIZE = 1_000_000;
const EXPECTED_MAX_OUTPUT_TOKENS = 64_000;
const EXPECTED_MAX_INPUT_TOKENS = 936_000;

describe("DeepSeek V4 Pro model configuration", () => {
  it("keeps the native spec on the model_constructors endpoint", () => {
    expect(DeepSeekDeepSeekV4ProGlobalFireworksStream.contextSize).toBe(
      NATIVE_CONTEXT_SIZE
    );
    expect(DeepSeekDeepSeekV4ProGlobalFireworksStream.maxOutputTokens).toBe(
      NATIVE_MAX_OUTPUT_TOKENS
    );
  });

  it("preserves the existing Dust context and rendering budget", () => {
    expect(DustDeepSeekDeepSeekV4ProGlobalFireworksStream.contextSize).toBe(
      EXPECTED_CONTEXT_SIZE
    );
    expect(DustDeepSeekDeepSeekV4ProGlobalFireworksStream.maxOutputTokens).toBe(
      EXPECTED_MAX_OUTPUT_TOKENS
    );
    expect(FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG.contextSize).toBe(
      EXPECTED_CONTEXT_SIZE
    );
    expect(FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG.generationTokensCount).toBe(
      EXPECTED_MAX_OUTPUT_TOKENS
    );
    expect(
      FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG.contextSize -
        FIREWORKS_DEEPSEEK_V4_PRO_MODEL_CONFIG.generationTokensCount
    ).toBe(EXPECTED_MAX_INPUT_TOKENS);
  });
});
