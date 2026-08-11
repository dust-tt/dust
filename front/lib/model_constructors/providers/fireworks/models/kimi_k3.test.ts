// @vitest-environment node

import { MODEL_PRICING } from "@app/lib/api/assistant/token_pricing";
import { DustMoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { MoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import {
  FIREWORKS_KIMI_K3_MODEL_CONFIG,
  FIREWORKS_KIMI_K3_MODEL_ID,
} from "@app/types/assistant/models/fireworks";
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

  it("uses Fireworks Responses in priority mode without storage", () => {
    const endpoint = new MoonshotAiKimiK3GlobalFireworksStream({
      FIREWORKS_API_KEY: "test",
    });
    const payload = endpoint.buildRequestPayload(
      { conversation: { system: [], messages: [] } },
      MoonshotAiKimiK3GlobalFireworksStream.configSchema.parse({})
    );

    expect(payload.model).toBe("accounts/fireworks/models/kimi-k3");
    expect(payload.store).toBe(false);
    expect(payload.service_tier).toBe("priority");
    expect(MoonshotAiKimiK3GlobalFireworksStream.tokenPricing).toEqual({
      cacheHit: 0.375,
      standardInput: 3.75,
      standardOutput: 18.75,
    });
    expect(MODEL_PRICING[FIREWORKS_KIMI_K3_MODEL_ID]).toEqual({
      input: 3.75,
      output: 18.75,
      cache_read_input_tokens: 0.375,
    });
  });

  it("exposes no `none` tier and reaches Fireworks natively at `light`", () => {
    // K3 always thinks, so `none` is not a reachable tier. `light` must map to
    // Fireworks' `low` rather than dropping reasoning_effort, which is what
    // `useNativeLightReasoning` switches on (see `mapReasoningEffort`); it also
    // suppresses the chain-of-thought meta prompt.
    expect(FIREWORKS_KIMI_K3_MODEL_CONFIG.supportedReasoningEfforts).toEqual({
      none: false,
      light: true,
      medium: true,
      high: true,
    });
    expect(FIREWORKS_KIMI_K3_MODEL_CONFIG.useNativeLightReasoning).toBe(true);
    expect(FIREWORKS_KIMI_K3_MODEL_CONFIG.defaultReasoningEffort).toBe("light");
  });

  it("forces every Dust request to temperature zero", () => {
    const config: InputConfig = {
      reasoning: { effort: "medium" },
      temperature: 0.7,
    };

    const parsedConfig =
      DustMoonshotAiKimiK3GlobalFireworksStream.configParsers.reduce(
        (currentConfig, parser) => parser(currentConfig),
        config
      );

    expect(parsedConfig).toEqual({
      reasoning: { effort: "high" },
      temperature: 0,
    });
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
