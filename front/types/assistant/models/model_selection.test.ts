import { describe, expect, it, vi } from "vitest";

import { MODEL_IDS } from "./models";
import { ModelSelectionSchema } from "./types";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-selection-test");

vi.mock("./custom_models.generated", () => ({
  CUSTOM_MODELS: [],
  CUSTOM_MODEL_CONFIGS: [],
  CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID],
}));

describe("ModelSelectionSchema", () => {
  it("rejects a custom model, which is only reachable through its global agents", () => {
    expect(MODEL_IDS).toContain(CUSTOM_MODEL_ID);
    expect(
      ModelSelectionSchema.safeParse({
        providerId: "anthropic",
        modelId: CUSTOM_MODEL_ID,
      }).success
    ).toBe(false);
  });

  it("accepts a static model", () => {
    expect(
      ModelSelectionSchema.safeParse({
        providerId: "anthropic",
        modelId: "claude-opus-5-5",
      }).success
    ).toBe(true);
  });
});
