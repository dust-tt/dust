import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getModels(workspace: { sId: string }, key: { secret: string }) {
  return honoApp.request(`/api/v1/w/${workspace.sId}/models`, {
    headers: { authorization: `Bearer ${key.secret}` },
  });
}

describe("GET /api/v1/w/:wId/models", () => {
  it("returns 403 if not a system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest();

    const response = await getModels(workspace, key);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys can perform this action.",
      },
    });
  });

  it("returns an empty list when the models picker feature is not enabled", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await getModels(workspace, key);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: [] });
  });

  it("returns the selectable models when the models picker feature is enabled", async () => {
    const { workspace, key, auth } = await createPublicApiMockRequest({
      systemKey: true,
    });

    await FeatureFlagFactory.basic(auth, "models_picker");

    const response = await getModels(workspace, key);

    expect(response.status).toBe(200);
    const { models } = await response.json();
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
      expect(model).toEqual({
        providerId: expect.any(String),
        modelId: expect.any(String),
        displayName: expect.any(String),
        supportedReasoningEfforts: expect.any(Array),
        defaultReasoningEffort: expect.any(String),
      });
      expect(model.modelId).not.toBe(AUTO_MODEL_ID);
    }
  });
});
