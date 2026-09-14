// @vitest-environment node

import { DustMoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/llms/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { MoonshotAiKimiK3GlobalFireworksStream } from "@app/lib/model_constructors/stream/endpoints/moonshot_ai_kimi_k3_global_fireworks";
import { itKeepsLimitsAndPricingConsistent } from "@app/lib/model_constructors/test/model_limits";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import { FIREWORKS_KIMI_K3_MODEL_CONFIG } from "@app/types/assistant/models/fireworks";
import { describe, expect, it } from "vitest";

// Dust product caps, asserted below to leave a 192k prompt budget.
const EXPECTED_CONTEXT_SIZE = 256_000;
const EXPECTED_MAX_OUTPUT_TOKENS = 64_000;
const EXPECTED_MAX_INPUT_TOKENS = 192_000;

describe("Kimi K3 model configuration", () => {
  itKeepsLimitsAndPricingConsistent({
    streamEndpoint: MoonshotAiKimiK3GlobalFireworksStream,
    dustStreamEndpoint: DustMoonshotAiKimiK3GlobalFireworksStream,
    modelConfig: FIREWORKS_KIMI_K3_MODEL_CONFIG,
    // Real Fireworks/Moonshot spec, see the config mixin for sources.
    native: { contextSize: 1_040_000, maxOutputTokens: 131_072 },
    dust: {
      contextSize: EXPECTED_CONTEXT_SIZE,
      maxOutputTokens: EXPECTED_MAX_OUTPUT_TOKENS,
    },
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

  it("leaves a 192k prompt budget once the generation reserve is taken out", () => {
    expect(
      FIREWORKS_KIMI_K3_MODEL_CONFIG.contextSize -
        FIREWORKS_KIMI_K3_MODEL_CONFIG.generationTokensCount
    ).toBe(EXPECTED_MAX_INPUT_TOKENS);
  });
});
