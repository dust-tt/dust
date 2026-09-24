import type { EffortStop } from "@app/components/model_picker/modelPickerUtils";
import { ReasoningEffortSlider } from "@app/components/model_picker/ReasoningEffortSlider";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const LABEL_PATTERN = /^(None|Minimal|Low|Medium|High|XHigh|Max|Light)$/;

function availableStops(efforts: ReasoningEffort[]): EffortStop[] {
  return efforts.map((effort) => ({ effort, unavailabilityReason: null }));
}

function renderedLabels(stops: EffortStop[], value: ReasoningEffort) {
  render(
    <ReasoningEffortSlider stops={stops} value={value} onChange={vi.fn()} />
  );
  return screen
    .getAllByRole("button", { name: LABEL_PATTERN })
    .map((button) => button.textContent);
}

describe("ReasoningEffortSlider", () => {
  beforeAll(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("labels every stop when three fit", () => {
    expect(
      renderedLabels(availableStops(["light", "medium", "high"]), "light")
    ).toEqual(["Light", "Medium", "High"]);
  });

  it("labels only the ends and the selected stop when more do not fit", () => {
    expect(
      renderedLabels(
        availableStops([
          "none",
          "minimal",
          "low",
          "medium",
          "high",
          "xhigh",
          "maximal",
        ]),
        "medium"
      )
    ).toEqual(["None", "Medium", "Max"]);
  });
});
