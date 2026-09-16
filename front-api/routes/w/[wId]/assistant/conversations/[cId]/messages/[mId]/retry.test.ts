import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

describe("POST /api/w/:wId/assistant/conversations/:cId/messages/:mId/retry", () => {
  let workspaceId: string;

  beforeEach(async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "user",
      method: "POST",
    });
    workspaceId = workspace.sId;
  });

  function retryRequest(body?: string) {
    return honoApp.request(
      `/api/w/${workspaceId}/assistant/conversations/missing/messages/missing/retry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }
    );
  }

  it("keeps accepting the previous client's empty JSON body", async () => {
    const response = await retryRequest();

    expect(response.status).toBe(404);
  });

  it("rejects malformed nonempty JSON", async () => {
    const response = await retryRequest("{");

    expect(response.status).toBe(400);
  });

  it.each([
    "null",
    JSON.stringify({ modelSelection: null }),
  ])("rejects null JSON values", async (body) => {
    const response = await retryRequest(body);

    expect(response.status).toBe(400);
  });

  it("rejects an invalid model selection", async () => {
    const response = await retryRequest(
      JSON.stringify({
        modelSelection: {
          providerId: "invalid-provider",
          modelId: "invalid-model",
        },
      })
    );

    expect(response.status).toBe(400);
  });

  it("accepts a valid model selection", async () => {
    const response = await retryRequest(
      JSON.stringify({
        modelSelection: {
          providerId: AUTO_MODEL_ID,
          modelId: AUTO_MODEL_ID,
          reasoningEffort: "none",
        },
      })
    );

    expect(response.status).toBe(404);
  });
});
