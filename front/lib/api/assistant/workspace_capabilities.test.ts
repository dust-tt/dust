import { getAvailableModelsForWorkspace } from "@app/lib/api/assistant/workspace_capabilities";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it, vi } from "vitest";

const CUSTOM_MODEL_ID = vi.hoisted(() => "custom-model-for-listing-test");

vi.mock("@app/types/assistant/models/custom_models.generated", async () => {
  const { CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG } = await vi.importActual<
    typeof import("@app/types/assistant/models/anthropic")
  >("@app/types/assistant/models/anthropic");
  const modelConfig = {
    ...CLAUDE_SONNET_4_6_DEFAULT_MODEL_CONFIG,
    modelId: CUSTOM_MODEL_ID,
    availableIfOneOf: { featureFlag: "custom_model_feature" as const },
  };

  return {
    CUSTOM_MODELS: [],
    CUSTOM_MODEL_CONFIGS: [modelConfig],
    CUSTOM_MODEL_IDS: [CUSTOM_MODEL_ID],
  };
});

describe("getAvailableModelsForWorkspace", () => {
  it("never lists custom models, even for a workspace with their flag", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    await FeatureFlagFactory.basic(authenticator, "custom_model_feature");

    const models = await getAvailableModelsForWorkspace(authenticator);

    expect(models.length).toBeGreaterThan(0);
    expect(models.map((m) => m.modelId)).not.toContain(CUSTOM_MODEL_ID);
  });
});
