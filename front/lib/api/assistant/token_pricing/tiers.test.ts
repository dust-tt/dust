import {
  MODELS_TIERS,
  STATIC_MODEL_SUPPORTED_REASONING_EFFORTS,
  STATIC_MODEL_TIERS,
} from "@app/lib/api/assistant/token_pricing/tiers";
import { ModelsTierResource } from "@app/lib/resources/models_tier_resource";
import {
  CLAUDE_FABLE_5_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import {
  STATIC_MODEL_IDS,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types/assistant/models/models";
import {
  GPT_5_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
} from "@app/types/assistant/models/openai";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { GROK_4_FAST_REASONING_MODEL_CONFIG } from "@app/types/assistant/models/xai";
import { describe, expect, it } from "vitest";

describe("token_pricing/tiers", () => {
  it("lists tier definitions without selections", () => {
    expect(MODELS_TIERS.map((tier) => tier.id)).toEqual([1, 2, 3]);
    expect(MODELS_TIERS.every((tier) => tier.description.length > 0)).toBe(
      true
    );
    expect(MODELS_TIERS.every((tier) => !("selections" in tier))).toBe(true);
  });

  it("covers every StaticModelIdType in STATIC_MODEL_TIERS", () => {
    expect(Object.keys(STATIC_MODEL_TIERS).sort()).toEqual(
      [...STATIC_MODEL_IDS].sort()
    );
  });

  it("keeps STATIC_MODEL_SUPPORTED_REASONING_EFFORTS in sync with SUPPORTED_MODEL_CONFIGS", () => {
    for (const modelId of STATIC_MODEL_IDS) {
      const config =
        SUPPORTED_MODEL_CONFIGS.find((entry) => entry.modelId === modelId) ??
        (modelId === GROK_4_FAST_REASONING_MODEL_CONFIG.modelId
          ? GROK_4_FAST_REASONING_MODEL_CONFIG
          : null);

      expect(config).not.toBeNull();
      expect(STATIC_MODEL_SUPPORTED_REASONING_EFFORTS[modelId]).toEqual(
        config!.supportedReasoningEfforts
      );
    }
  });

  it("assigns a tier for each supported reasoning effort", () => {
    for (const modelId of STATIC_MODEL_IDS) {
      const supportedEfforts = getAvailableReasoningEfforts(
        STATIC_MODEL_SUPPORTED_REASONING_EFFORTS[modelId]
      );

      expect(Object.keys(STATIC_MODEL_TIERS[modelId]).sort()).toEqual(
        [...supportedEfforts].sort()
      );
    }
  });

  it("classifies opus/fable as premium", () => {
    expect(
      ModelsTierResource.getTierForModel(CLAUDE_OPUS_4_8_MODEL_ID, "light")
    ).toBe("premium");
    expect(
      ModelsTierResource.getTierForModel(CLAUDE_FABLE_5_MODEL_ID, "high")
    ).toBe("premium");
  });

  it("classifies sonnet with light reasoning as cost efficient", () => {
    expect(
      ModelsTierResource.getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "light")
    ).toBe("cost_efficient");
  });

  it("classifies sonnet with medium reasoning as balanced", () => {
    expect(
      ModelsTierResource.getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "medium")
    ).toBe("balanced");
  });

  it("classifies large non-sonnet models with light reasoning as premium", () => {
    expect(ModelsTierResource.getTierForModel(GPT_5_5_MODEL_ID, "light")).toBe(
      "premium"
    );
  });

  it("classifies small models with light reasoning as cost efficient", () => {
    expect(
      ModelsTierResource.getTierForModel(GPT_5_NANO_MODEL_ID, "light")
    ).toBe("cost_efficient");
  });

  it("resolves tiers from a full selection", () => {
    expect(
      ModelsTierResource.getTierForSelection({
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_5_MODEL_ID,
        reasoningEffort: "light",
      })
    ).toBe("cost_efficient");
    expect(
      ModelsTierResource.getTierForSelection({
        providerId: "openai",
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "high",
      })
    ).toBe("premium");
  });
});
