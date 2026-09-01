import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GetEnabledModelsResponseType } from "@app/types/api/assistant/models";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/models", () => {
  it("returns backend-owned selection availability", async () => {
    const { workspace } = await createPrivateApiMockRequest();

    const response = await honoApp.request(`/api/w/${workspace.sId}/models`);

    expect(response.status).toBe(200);
    const body: GetEnabledModelsResponseType = await response.json();
    expect(body.models.length).toBeGreaterThan(0);
    expect(
      body.models.every((model) => model.selectionAvailability !== undefined)
    ).toBe(true);
    expect(body.defaultModel.selectionAvailability).toBeDefined();
  });
});
