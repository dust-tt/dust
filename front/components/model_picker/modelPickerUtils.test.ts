import {
  getDefaultTierId,
  getEffortStops,
  getEffortStopTooltip,
  getInitialEffort,
  getModelTier,
  getPinnedModelRetryTier,
  getTierLockReason,
  isModelHostedInRegion,
  isModelLocked,
  isTierResolvedModelHostedInRegion,
  PREMIUM_MODEL_LOCKED_TOOLTIP,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import {
  CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG,
  CLAUDE_FABLE_5_MODEL_ID,
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

describe("getPinnedModelRetryTier", () => {
  const sonnetLight = {
    providerId: "anthropic" as const,
    modelId: CLAUDE_SONNET_5_MODEL_ID,
    reasoningEffort: "light" as const,
  };

  for (const errorCategory of [
    "retryable_model_error",
    "provider_internal_error",
    "stream_error",
    "empty_content",
  ] as const) {
    it(`offers the model's tier for ${errorCategory}`, () => {
      expect(
        getPinnedModelRetryTier({
          failedModel: sonnetLight,
          modelResolutionMethod: "user",
          errorCategory,
        })
      ).toBe("fast");
    });
  }

  it("offers the Premium row for an ultra-tier pinned model, which has no picker row", () => {
    expect(
      getPinnedModelRetryTier({
        failedModel: {
          providerId: "anthropic",
          modelId: CLAUDE_FABLE_5_MODEL_ID,
          reasoningEffort: "high",
        },
        modelResolutionMethod: "user",
        errorCategory: "provider_internal_error",
      })
    ).toBe("complex");
  });

  it("offers the tier for an agent-configured pinned model", () => {
    expect(
      getPinnedModelRetryTier({
        failedModel: sonnetLight,
        modelResolutionMethod: "agent",
        errorCategory: "provider_internal_error",
      })
    ).toBe("fast");
  });

  it("offers the tier when the resolution method is unknown", () => {
    expect(
      getPinnedModelRetryTier({
        failedModel: sonnetLight,
        modelResolutionMethod: null,
        errorCategory: "provider_internal_error",
      })
    ).toBe("fast");
  });

  it("does not offer a tier for stream-resolved failures", () => {
    expect(
      getPinnedModelRetryTier({
        failedModel: sonnetLight,
        modelResolutionMethod: "auto",
        errorCategory: "provider_internal_error",
      })
    ).toBeNull();
  });

  it("does not offer a tier after a fair-use downgrade", () => {
    expect(
      getPinnedModelRetryTier({
        failedModel: sonnetLight,
        modelResolutionMethod: "fair_use_downgrade",
        errorCategory: "provider_internal_error",
      })
    ).toBeNull();
  });

  it("rejects non-model errors", () => {
    expect(
      getPinnedModelRetryTier({
        failedModel: sonnetLight,
        modelResolutionMethod: "user",
        errorCategory: "context_window_exceeded",
      })
    ).toBeNull();
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

    it("locks every effort of an ultra-tier model when gated", () => {
      const stops = getEffortStops(CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG, GATED);
      expect(unavailabilityReasonByEffort(stops)).toEqual({
        light: "premium",
        medium: "premium",
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

  describe("isModelLocked", () => {
    it("locks a whole-premium or ultra reasoning model on a legacy plan", () => {
      expect(isModelLocked(CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG, GATED)).toBe(
        true
      );
      expect(isModelLocked(CLAUDE_FABLE_5_DEFAULT_MODEL_CONFIG, GATED)).toBe(
        true
      );
    });

    it("locks a whole-premium non-reasoning model (only 'none') on a legacy plan", () => {
      expect(isModelLocked(O1_MODEL_CONFIG, GATED)).toBe(true);
    });

    it("keeps mixed models selectable on a legacy plan", () => {
      expect(isModelLocked(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG, GATED)).toBe(
        false
      );
      expect(isModelLocked(GEMINI_2_5_PRO_MODEL_CONFIG, GATED)).toBe(false);
    });

    it("never locks a model whose efforts are all selectable", () => {
      expect(isModelLocked(CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG, UNGATED)).toBe(
        false
      );
      expect(isModelLocked(O1_MODEL_CONFIG, UNGATED)).toBe(false);
    });

    it("locks a reasoning model with no effort left in the member's cap", () => {
      const cappedOpus: ModelConfigurationType = {
        ...CLAUDE_OPUS_4_8_DEFAULT_MODEL_CONFIG,
        supportedReasoningEfforts: {
          none: false,
          light: false,
          medium: false,
          high: false,
        },
      };

      expect(isModelLocked(cappedOpus, UNGATED)).toBe(true);
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
