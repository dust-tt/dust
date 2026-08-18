import {
  MODELS_TIERS,
  STATIC_MODEL_SUPPORTED_REASONING_EFFORTS,
  STATIC_MODEL_TIERS,
} from "@app/lib/api/assistant/token_pricing/tiers";
import {
  getTierForModel,
  getTierForSelection,
} from "@app/lib/model_tiers/allowed_tiers";
import {
  CLAUDE_FABLE_5_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import {
  isStaticModelId,
  STATIC_MODEL_IDS,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types/assistant/models/models";
import {
  GPT_5_5_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
} from "@app/types/assistant/models/openai";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { GROK_4_6_MODEL_ID } from "@app/types/assistant/models/xai";
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
    for (const config of SUPPORTED_MODEL_CONFIGS) {
      // Custom models are generated at build time and priced via the fallback in
      // getTierForModel, not the static map.
      if (!isStaticModelId(config.modelId)) {
        continue;
      }

      expect(STATIC_MODEL_SUPPORTED_REASONING_EFFORTS[config.modelId]).toEqual(
        config.supportedReasoningEfforts
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
    expect(getTierForModel(CLAUDE_OPUS_4_8_MODEL_ID, "light")).toBe("premium");
    expect(getTierForModel(CLAUDE_FABLE_5_MODEL_ID, "high")).toBe("premium");
  });

  it("classifies Grok 4.6 high reasoning as premium", () => {
    expect(getTierForModel(GROK_4_6_MODEL_ID, "light")).toBe("balanced");
    expect(getTierForModel(GROK_4_6_MODEL_ID, "medium")).toBe("balanced");
    expect(getTierForModel(GROK_4_6_MODEL_ID, "high")).toBe("premium");
  });

  it("classifies generated custom models as premium", () => {
    // Custom models are generated from GCS at build time and are therefore not
    // present in the checked-in CUSTOM_MODEL_IDS fixture.
    const customModelId = "my-custom-model-from-eap" as ModelIdType;

    expect(getTierForModel(customModelId, "high")).toBe("premium");
  });

  it("classifies sonnet with light reasoning as cost efficient", () => {
    expect(getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "light")).toBe(
      "cost_efficient"
    );
  });

  it("classifies sonnet with medium reasoning as balanced", () => {
    expect(getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "medium")).toBe(
      "balanced"
    );
  });

  it("classifies sonnet with high reasoning as premium", () => {
    expect(getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "high")).toBe("premium");
  });

  it("classifies large non-sonnet models with light reasoning as premium", () => {
    expect(getTierForModel(GPT_5_5_MODEL_ID, "light")).toBe("premium");
  });

  it("classifies the long-context Terra model as premium", () => {
    for (const effort of ["none", "light", "medium", "high"] as const) {
      expect(getTierForModel(GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID, effort)).toBe(
        "premium"
      );
    }
  });

  it("classifies small models with light reasoning as cost efficient", () => {
    expect(getTierForModel(GPT_5_NANO_MODEL_ID, "light")).toBe(
      "cost_efficient"
    );
  });

  it("resolves tiers from a full selection", () => {
    expect(
      getTierForSelection({
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_5_MODEL_ID,
        reasoningEffort: "light",
      })
    ).toBe("cost_efficient");
    expect(
      getTierForSelection({
        providerId: "openai",
        modelId: GPT_5_5_MODEL_ID,
        reasoningEffort: "high",
      })
    ).toBe("premium");
  });
});
