import {
  MODEL_PICKER_CAMPAIGN_ID,
  trackModelPickerExposure,
  trackModelPickerOpen,
  trackModelPickerSelect,
} from "@app/components/model_picker/modelPickerTracking";
import type { SelectionDisplay } from "@app/components/model_picker/modelPickerUtils";
import { trackEvent } from "@app/lib/tracking";
import { CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep the real TRACKING_AREAS/TRACKING_ACTIONS so the module builds genuine
// values; only intercept the emit so we can assert the event contract.
vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});

const trackEventMock = vi.mocked(trackEvent);

beforeEach(() => {
  trackEventMock.mockClear();
});

const BASE = { surface: "conversation_input_bar", clientType: "web" } as const;

const COMMON_EXTRA = {
  surface: "conversation_input_bar",
  campaign_id: MODEL_PICKER_CAMPAIGN_ID,
  client_type: "web",
};

describe("modelPickerTracking", () => {
  it("emits assistant:model_picker:exposure with the shared properties", () => {
    trackModelPickerExposure(BASE);

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    expect(trackEventMock).toHaveBeenCalledWith({
      area: "assistant",
      object: "model_picker",
      action: "exposure",
      extra: COMMON_EXTRA,
    });
  });

  it("emits assistant:model_picker:open with the shared properties", () => {
    trackModelPickerOpen({ ...BASE, clientType: "extension" });

    expect(trackEventMock).toHaveBeenCalledWith({
      area: "assistant",
      object: "model_picker",
      action: "open",
      extra: { ...COMMON_EXTRA, client_type: "extension" },
    });
  });

  it("emits a tier select with the tier id", () => {
    trackModelPickerSelect({
      ...BASE,
      display: { kind: "tier", tierId: "complex" },
      trigger: "tier",
    });

    expect(trackEventMock).toHaveBeenCalledWith({
      area: "assistant",
      object: "model_picker",
      action: "select",
      extra: {
        ...COMMON_EXTRA,
        trigger: "tier",
        selection_kind: "tier",
        tier_id: "complex",
      },
    });
  });

  it("emits a model select with model/provider/effort and the trigger", () => {
    const display: SelectionDisplay = {
      kind: "model",
      model: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG,
      effort: "medium",
    };

    trackModelPickerSelect({ ...BASE, display, trigger: "reasoning_effort" });

    expect(trackEventMock).toHaveBeenCalledWith({
      area: "assistant",
      object: "model_picker",
      action: "select",
      extra: {
        ...COMMON_EXTRA,
        trigger: "reasoning_effort",
        selection_kind: "model",
        model_id: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.modelId,
        provider_id: CLAUDE_SONNET_5_DEFAULT_MODEL_CONFIG.providerId,
        reasoning_effort: "medium",
      },
    });
  });

  it("tags a revert with the trigger while still describing the resulting selection", () => {
    trackModelPickerSelect({
      ...BASE,
      display: { kind: "tier", tierId: "standard" },
      trigger: "revert",
    });

    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "select",
        extra: expect.objectContaining({
          trigger: "revert",
          selection_kind: "tier",
          tier_id: "standard",
        }),
      })
    );
  });
});
