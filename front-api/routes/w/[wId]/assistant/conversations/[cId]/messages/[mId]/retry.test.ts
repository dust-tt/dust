import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
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

  it("keeps accepting an omitted request body", async () => {
    const response = await honoApp.request(
      `/api/w/${workspaceId}/assistant/conversations/missing/messages/missing/retry`,
      { method: "POST" }
    );

    expect(response.status).toBe(404);
  });

  it("rejects an invalid model selection", async () => {
    const response = await honoApp.request(
      `/api/w/${workspaceId}/assistant/conversations/missing/messages/missing/retry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelSelection: {
            providerId: "invalid-provider",
            modelId: "invalid-model",
          },
        }),
      }
    );

    expect(response.status).toBe(400);
  });
});
