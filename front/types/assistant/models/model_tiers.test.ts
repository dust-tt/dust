import {
  CLAUDE_FABLE_5_MODEL_ID,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_5_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import { AUTO_MODEL_CONFIG } from "@app/types/assistant/models/auto";
import {
  getTieredReasoningEffort,
  getTierForModel,
  getTierForModelConfiguration,
  getTierForSelection,
  MODELS_TIERS,
  STATIC_MODEL_SUPPORTED_REASONING_EFFORTS,
  STATIC_MODEL_TIERS,
} from "@app/types/assistant/models/model_tiers";
import {
  isStaticModelId,
  STATIC_MODEL_IDS,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types/assistant/models/models";
import {
  GPT_5_5_MODEL_ID,
  GPT_5_6_TERRA_LONG_CONTEXT_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  GPT_6_ASTRA_MODEL_ID,
} from "@app/types/assistant/models/openai";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import { GROK_4_6_MODEL_ID } from "@app/types/assistant/models/xai";
import { describe, expect, it } from "vitest";

describe("model_tiers", () => {
  it("keeps Astra premium at every supported reasoning effort", () => {
    const efforts = getAvailableReasoningEfforts(
      STATIC_MODEL_SUPPORTED_REASONING_EFFORTS[GPT_6_ASTRA_MODEL_ID]
    );
    expect(efforts).toEqual(["light", "medium", "high"]);
    for (const effort of efforts) {
      expect(getTierForModel(GPT_6_ASTRA_MODEL_ID, effort)).toBe("premium");
    }
  });

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

  describe("getTierForModelConfiguration", () => {
    const getConfig = (modelId: ModelIdType) => {
      const config = SUPPORTED_MODEL_CONFIGS.find((c) => c.modelId === modelId);
      if (!config) {
        throw new Error(`No supported model config for ${modelId}`);
      }
      return config;
    };

    it("resolves the tier for a mapped reasoning effort", () => {
      expect(
        getTierForModelConfiguration(
          getConfig(CLAUDE_SONNET_5_MODEL_ID),
          "high"
        )
      ).toBe("premium");
    });

    it("falls back to the default effort when none is given", () => {
      const config = getConfig(CLAUDE_SONNET_5_MODEL_ID);

      expect(getTierForModelConfiguration(config)).toBe(
        getTierForModel(config.modelId, config.defaultReasoningEffort)
      );
    });

    it("falls back to the default effort for a stale unmapped effort", () => {
      // The auto stream only maps "none"; a stale "medium" kept from a
      // previous model must resolve to the stream's own tier, not to no tier.
      expect(getTierForModelConfiguration(AUTO_MODEL_CONFIG, "medium")).toBe(
        "balanced"
      );
    });
  });

  describe("getTieredReasoningEffort", () => {
    it("keeps a mapped effort and replaces a stale one", () => {
      const sonnet = SUPPORTED_MODEL_CONFIGS.find(
        (c) => c.modelId === CLAUDE_SONNET_5_MODEL_ID
      );
      if (!sonnet) {
        throw new Error("No supported model config for sonnet");
      }

      expect(getTieredReasoningEffort(sonnet, "high")).toBe("high");
      expect(getTieredReasoningEffort(sonnet)).toBe(
        sonnet.defaultReasoningEffort
      );
      expect(getTieredReasoningEffort(AUTO_MODEL_CONFIG, "medium")).toBe(
        "none"
      );
    });
  });
});
