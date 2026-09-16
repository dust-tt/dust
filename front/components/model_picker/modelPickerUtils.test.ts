import {
  getDefaultTierId,
  getEffortStops,
  getEffortStopTooltip,
  getInitialEffort,
  getModelTier,
  getTierLockReason,
  isDegradedModelFailure,
  isModelHostedInRegion,
  isPremiumModel,
  isTierResolvedModelHostedInRegion,
  materializeSelection,
  PREMIUM_MODEL_LOCKED_TOOLTIP,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import {
  CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
  CLAUDE_SONNET_5_MODEL_ID,
} from "@app/types/assistant/models/anthropic";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_COMPLEX_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
} from "@app/types/assistant/models/auto";
import { GEMINI_2_5_PRO_MODEL_CONFIG } from "@app/types/assistant/models/google_ai_studio";
import { getTierForModel } from "@app/types/assistant/models/model_tiers";
import { O1_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type {
  ModelConfigurationType,
  ModelIdType,
} from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

const GATED = { lockPremiumEfforts: true };
const UNGATED = { lockPremiumEfforts: false };

describe("isDegradedModelFailure", () => {
  const degradedModelIds = new Set([CLAUDE_SONNET_5_MODEL_ID]);

  for (const errorCategory of [
    "retryable_model_error",
    "provider_internal_error",
    "stream_error",
    "empty_content",
  ] as const) {
    it(`recognizes ${errorCategory}`, () => {
      expect(
        isDegradedModelFailure({
          failedModelId: CLAUDE_SONNET_5_MODEL_ID,
          errorCategory,
          degradedModelIds,
        })
      ).toBe(true);
    });
  }

  it("rejects non-model errors even if the failed model is degraded", () => {
    expect(
      isDegradedModelFailure({
        failedModelId: CLAUDE_SONNET_5_MODEL_ID,
        errorCategory: "context_window_exceeded",
        degradedModelIds,
      })
    ).toBe(false);
  });

  it("requires the failed model to be currently degraded", () => {
    expect(
      isDegradedModelFailure({
        failedModelId: CLAUDE_OPUS_4_8_MODEL_ID,
        errorCategory: "retryable_model_error",
        degradedModelIds,
      })
    ).toBe(false);
  });
});

describe("materializeSelection", () => {
  it("names the stream a tier display stands for", () => {
    expect(materializeSelection({ kind: "tier", tierId: "standard" })).toEqual({
      providerId: AUTO_MODEL_ID,
      modelId: AUTO_MODEL_ID,
      reasoningEffort: "none",
    });
  });

  it("names the model and effort a model display stands for", () => {
    expect(
      materializeSelection({
        kind: "model",
        model: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
        effort: "high",
      })
    ).toEqual({
      providerId: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.providerId,
      modelId: CLAUDE_SONNET_5_MODEL_ID,
      reasoningEffort: "high",
    });
  });
});

const unavailabilityReasonByEffort = (
  stops: ReturnType<typeof getEffortStops>
): Record<string, string | null> =>
  Object.fromEntries(
    stops.map((stop) => [stop.effort, stop.unavailabilityReason])
  );

describe("modelPickerUtils premium gating", () => {
  describe("getTierForModel", () => {
    it("mirrors the static tier table", () => {
      expect(getTierForModel(CLAUDE_OPUS_4_8_MODEL_ID, "light")).toBe(
        "premium"
      );
      expect(getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "light")).toBe(
        "cost_efficient"
      );
      expect(getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "medium")).toBe(
        "balanced"
      );
      expect(getTierForModel(CLAUDE_SONNET_5_MODEL_ID, "high")).toBe("premium");
    });

    it("treats models absent from the static table as premium", () => {
      const customModelId = "my-custom-model-from-eap" as ModelIdType;
      expect(getTierForModel(customModelId, "high")).toBe("premium");
    });
  });

  describe("getEffortStops", () => {
    it("locks premium efforts with reason 'premium' when gated (mixed model)", () => {
      // Sonnet 5: light=cost_efficient, medium=balanced, high=premium.
      const stops = getEffortStops(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG, GATED);
      expect(unavailabilityReasonByEffort(stops)).toEqual({
        light: null,
        medium: null,
        high: "premium",
      });
    });

    it("locks every premium effort of a mid-tier reasoning model", () => {
      // Gemini 2.5 Pro: light=balanced, medium=premium, high=premium.
      const stops = getEffortStops(GEMINI_2_5_PRO_MODEL_CONFIG, GATED);
      expect(unavailabilityReasonByEffort(stops)).toEqual({
        light: null,
        medium: "premium",
        high: "premium",
      });
    });

    it("does not lock anything when ungated", () => {
      const stops = getEffortStops(
        CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
        UNGATED
      );
      expect(stops.every((stop) => stop.unavailabilityReason === null)).toBe(
        true
      );
    });
  });

  describe("getEffortStopTooltip", () => {
    it("explains why an effort is unselectable", () => {
      expect(
        getEffortStopTooltip({
          effort: "light",
          unavailabilityReason: null,
        })
      ).toBeNull();
      expect(
        getEffortStopTooltip({
          effort: "high",
          unavailabilityReason: "unsupported",
        })
      ).toBe("This model doesn't support High reasoning.");
      expect(
        getEffortStopTooltip({
          effort: "high",
          unavailabilityReason: "premium",
        })
      ).toBe(PREMIUM_MODEL_LOCKED_TOOLTIP);
      expect(
        getEffortStopTooltip({
          effort: "medium",
          unavailabilityReason: "model_tier",
        })
      ).toBe(
        "Your current model access doesn't include this option. " +
          "Contact your administrator to get access."
      );
    });
  });

  describe("isPremiumModel", () => {
    it("locks a whole-premium reasoning model when gated", () => {
      expect(isPremiumModel(CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG, GATED)).toBe(
        true
      );
    });

    it("locks a whole-premium non-reasoning model (only 'none') when gated", () => {
      expect(isPremiumModel(O1_MODEL_CONFIG, GATED)).toBe(true);
    });

    it("keeps mixed models selectable when gated", () => {
      expect(isPremiumModel(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG, GATED)).toBe(
        false
      );
      expect(isPremiumModel(GEMINI_2_5_PRO_MODEL_CONFIG, GATED)).toBe(false);
    });

    it("never locks a model when ungated", () => {
      expect(
        isPremiumModel(CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG, UNGATED)
      ).toBe(false);
      expect(isPremiumModel(O1_MODEL_CONFIG, UNGATED)).toBe(false);
    });
  });

  describe("getTierLockReason", () => {
    const streamModel = (
      modelId: ModelStreamIdType,
      isSelectable: boolean
    ): EnabledModelConfigurationType => ({
      ...AUTO_COMPLEX_MODEL_CONFIG,
      modelId,
      providerId: modelId,
      isSelectable,
    });

    it("locks a tier whose stream is above the member's cap", () => {
      expect(
        getTierLockReason("complex", {
          ...UNGATED,
          streamModels: [streamModel(AUTO_COMPLEX_MODEL_ID, false)],
        })
      ).toBe("model_tier");
      expect(
        getTierLockReason("fast", {
          ...UNGATED,
          streamModels: [streamModel(AUTO_FAST_MODEL_ID, true)],
        })
      ).toBeNull();
    });

    it("locks the Premium tier on a legacy plan whatever the cap", () => {
      expect(
        getTierLockReason("complex", {
          ...GATED,
          streamModels: [streamModel(AUTO_COMPLEX_MODEL_ID, true)],
        })
      ).toBe("premium");
    });

    it("does not lock a tier whose stream is absent from the payload", () => {
      expect(
        getTierLockReason("standard", { ...UNGATED, streamModels: [] })
      ).toBeNull();
    });
  });

  describe("getDefaultTierId", () => {
    const streamModel = (
      modelId: ModelStreamIdType,
      isSelectable: boolean
    ): EnabledModelConfigurationType => ({
      ...AUTO_COMPLEX_MODEL_CONFIG,
      modelId,
      providerId: modelId,
      isSelectable,
    });

    it("falls back to Basic when Standard is above the member's cap", () => {
      expect(getDefaultTierId([streamModel(AUTO_MODEL_ID, false)])).toBe(
        "fast"
      );
    });

    it("keeps Standard when the member can run it, or while the payload is in flight", () => {
      expect(getDefaultTierId([streamModel(AUTO_MODEL_ID, true)])).toBe(
        "standard"
      );
      expect(getDefaultTierId([])).toBe("standard");
    });
  });

  describe("getInitialEffort", () => {
    it("never returns a premium effort when gated (mixed models)", () => {
      expect(
        getTierForModel(
          CLAUDE_SONNET_5_MODEL_ID,
          getInitialEffort(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG, GATED)
        )
      ).not.toBe("premium");
      expect(
        getTierForModel(
          GEMINI_2_5_PRO_MODEL_CONFIG.modelId,
          getInitialEffort(GEMINI_2_5_PRO_MODEL_CONFIG, GATED)
        )
      ).not.toBe("premium");
    });
  });
});

describe("modelPickerUtils regional hosting flag", () => {
  const streamResolutions = (
    model: ModelConfigurationType
  ): ModelStreamResolutionsType => {
    const resolution = {
      providerId: model.providerId,
      modelId: model.modelId,
      displayName: model.displayName,
      reasoningEffort: model.defaultReasoningEffort,
    };
    return {
      [AUTO_FAST_MODEL_ID]: resolution,
      [AUTO_MODEL_ID]: resolution,
      [AUTO_COMPLEX_MODEL_ID]: resolution,
    };
  };

  describe("isModelHostedInRegion", () => {
    it("follows the model's own regional availability", () => {
      expect(
        isModelHostedInRegion(
          CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
          "europe-west1"
        )
      ).toBe(true);
      expect(
        isModelHostedInRegion(GEMINI_2_5_PRO_MODEL_CONFIG, "europe-west1")
      ).toBe(false);
    });
  });

  describe("isTierResolvedModelHostedInRegion", () => {
    const standardTier = getModelTier("standard");

    it("follows the availability of the model the tier resolves to", () => {
      expect(
        isTierResolvedModelHostedInRegion(
          standardTier,
          streamResolutions(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG),
          "europe-west1"
        )
      ).toBe(true);
      expect(
        isTierResolvedModelHostedInRegion(
          standardTier,
          streamResolutions(GEMINI_2_5_PRO_MODEL_CONFIG),
          "europe-west1"
        )
      ).toBe(false);
    });

    it("claims nothing while the resolutions are still in flight", () => {
      expect(
        isTierResolvedModelHostedInRegion(standardTier, null, "europe-west1")
      ).toBe(false);
    });
  });
});
