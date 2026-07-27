import { DustMoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { MoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { FIREWORKS_KIMI_K3_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";
import { describe, expect, it } from "vitest";

// Real Fireworks/Moonshot spec, see the config mixin for sources.
const NATIVE_CONTEXT_SIZE = 1_040_000;
const NATIVE_MAX_OUTPUT_TOKENS = 131_072;

// Dust product caps.
const EXPECTED_CONTEXT_SIZE = 256_000;
const EXPECTED_MAX_OUTPUT_TOKENS = 64_000;
const EXPECTED_MAX_INPUT_TOKENS = 192_000;

describe("Kimi K3 model configuration", () => {
  it("keeps the native spec on the model_constructors endpoint", () => {
    expect(MoonshotAiKimiK3GlobalFireworksStream.contextSize).toBe(
      NATIVE_CONTEXT_SIZE
    );
    expect(MoonshotAiKimiK3GlobalFireworksStream.maxOutputTokens).toBe(
      NATIVE_MAX_OUTPUT_TOKENS
    );
  });

  it("caps context and output in the dust layer", () => {
    expect(DustMoonshotAiKimiK3GlobalFireworksStream.contextSize).toBe(
      EXPECTED_CONTEXT_SIZE
    );
    expect(DustMoonshotAiKimiK3GlobalFireworksStream.maxOutputTokens).toBe(
      EXPECTED_MAX_OUTPUT_TOKENS
    );
  });

  it("caps the legacy model config to match, leaving a 192k prompt budget", () => {
    expect(FIREWORKS_KIMI_K3_MODEL_CONFIG.contextSize).toBe(
      EXPECTED_CONTEXT_SIZE
    );
    expect(FIREWORKS_KIMI_K3_MODEL_CONFIG.generationTokensCount).toBe(
      EXPECTED_MAX_OUTPUT_TOKENS
    );
    expect(
      FIREWORKS_KIMI_K3_MODEL_CONFIG.contextSize -
        FIREWORKS_KIMI_K3_MODEL_CONFIG.generationTokensCount
    ).toBe(EXPECTED_MAX_INPUT_TOKENS);
  });
});
