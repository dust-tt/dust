import {
  getDefaultTierId,
  getEffortStops,
  getEffortStopTooltip,
  getInitialEffort,
  getModelLockReason,
  getTierLockReason,
  PREMIUM_ENTITLEMENT_LOCKED_TOOLTIP,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelSelectionAvailabilityType,
  ModelSelectionLockReason,
} from "@app/types/api/assistant/models";
import { CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import type { ModelStreamIdType } from "@app/types/assistant/models/auto";
import {
  AUTO_COMPLEX_MODEL_CONFIG,
  AUTO_COMPLEX_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_MODEL_ID,
} from "@app/types/assistant/models/auto";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

const SONNET_AVAILABILITY: ModelSelectionAvailabilityType = {
  defaultReasoningEffort: "medium",
  reasoningEfforts: [
    { effort: "light", unavailabilityReason: null },
    { effort: "medium", unavailabilityReason: null },
    { effort: "high", unavailabilityReason: "premium_entitlement" },
  ],
  lockReason: null,
};

function withAvailability(
  model: ModelConfigurationType,
  selectionAvailability: ModelSelectionAvailabilityType
): EnabledModelConfigurationType {
  return { ...model, isSelectable: true, selectionAvailability };
}

function streamModel(
  modelId: ModelStreamIdType,
  lockReason: ModelSelectionLockReason | null,
  isSelectable = lockReason !== "tier_limit"
): EnabledModelConfigurationType {
  return {
    ...withAvailability(
      {
        ...AUTO_COMPLEX_MODEL_CONFIG,
        modelId,
        providerId: modelId,
      },
      {
        defaultReasoningEffort: "none",
        reasoningEfforts: [],
        lockReason,
      }
    ),
    isSelectable,
  };
}

describe("modelPickerUtils", () => {
  it("reads effort and model availability reported by the backend", () => {
    const model = withAvailability(
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
      SONNET_AVAILABILITY
    );

    expect(getEffortStops(model)).toEqual(SONNET_AVAILABILITY.reasoningEfforts);
    expect(getInitialEffort(model)).toBe("medium");
    expect(getModelLockReason(model)).toBeNull();
  });

  it("falls back to the model default while an older response is in flight", () => {
    expect(getEffortStops(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)).toEqual([]);
    expect(getInitialEffort(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)).toBe(
      CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.defaultReasoningEffort
    );
    expect(getModelLockReason(CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG)).toBeNull();
  });

  it("explains why an effort is unselectable", () => {
    expect(
      getEffortStopTooltip({ effort: "light", unavailabilityReason: null })
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
        unavailabilityReason: "premium_entitlement",
      })
    ).toBe(PREMIUM_ENTITLEMENT_LOCKED_TOOLTIP);
    expect(
      getEffortStopTooltip({
        effort: "medium",
        unavailabilityReason: "tier_limit",
      })
    ).toBe(
      "Your current model access doesn't include this option. " +
        "Contact your administrator to get access."
    );
  });

  describe("tier availability", () => {
    it("uses the stream model's backend-owned lock reason", () => {
      expect(
        getTierLockReason("complex", [
          streamModel(AUTO_COMPLEX_MODEL_ID, "tier_limit"),
        ])
      ).toBe("tier_limit");
      expect(
        getTierLockReason("complex", [
          streamModel(AUTO_COMPLEX_MODEL_ID, "premium_entitlement"),
        ])
      ).toBe("premium_entitlement");
      expect(
        getTierLockReason("fast", [streamModel(AUTO_FAST_MODEL_ID, null)])
      ).toBeNull();
    });

    it("leaves a tier unlocked until its stream model is loaded", () => {
      expect(getTierLockReason("standard", [])).toBeNull();
    });

    it("defaults to Basic when Standard is above the member's tier cap", () => {
      expect(
        getDefaultTierId([streamModel(AUTO_MODEL_ID, "tier_limit", false)])
      ).toBe("fast");
    });

    it("defaults to Standard when selectable or still loading", () => {
      expect(getDefaultTierId([streamModel(AUTO_MODEL_ID, null)])).toBe(
        "standard"
      );
      expect(getDefaultTierId([])).toBe("standard");
    });
  });
});
