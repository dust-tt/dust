import {
  getDefaultTierId,
  getEffortStops,
  getEffortStopTooltip,
  getInitialEffort,
  getModelLockReason,
  getTierLockReason,
  PREMIUM_MODEL_LOCKED_TOOLTIP,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelSelectionAvailabilityType,
  ModelSelectionUnavailabilityReason,
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
    { effort: "high", unavailabilityReason: "premium" },
  ],
  unavailabilityReason: null,
};

function withAvailability(
  model: ModelConfigurationType,
  selectionAvailability: ModelSelectionAvailabilityType
): EnabledModelConfigurationType {
  return { ...model, isSelectable: true, selectionAvailability };
}

function streamModel(
  modelId: ModelStreamIdType,
  unavailabilityReason: ModelSelectionUnavailabilityReason | null,
  isSelectable = unavailabilityReason !== "model_tier"
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
        unavailabilityReason,
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
      getEffortStopTooltip({ effort: "high", unavailabilityReason: "premium" })
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

  describe("tier availability", () => {
    it("uses the stream model's backend-owned lock reason", () => {
      expect(
        getTierLockReason("complex", [
          streamModel(AUTO_COMPLEX_MODEL_ID, "model_tier"),
        ])
      ).toBe("model_tier");
      expect(
        getTierLockReason("complex", [
          streamModel(AUTO_COMPLEX_MODEL_ID, "premium"),
        ])
      ).toBe("premium");
      expect(
        getTierLockReason("fast", [streamModel(AUTO_FAST_MODEL_ID, null)])
      ).toBeNull();
    });

    it("leaves a tier unlocked until its stream model is loaded", () => {
      expect(getTierLockReason("standard", [])).toBeNull();
    });

    it("defaults to Basic when Standard is above the member's tier cap", () => {
      expect(
        getDefaultTierId([streamModel(AUTO_MODEL_ID, "model_tier", false)])
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
