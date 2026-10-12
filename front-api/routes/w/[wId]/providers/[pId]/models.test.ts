import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

describe("GET /api/w/:wId/providers/azure_openai/models", () => {
  it("refuses a stored endpoint outside Azure without requesting it", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    // No resource wraps providers, and the save route now refuses such an endpoint.
    await ProviderModel.create({
      workspaceId: workspace.id,
      providerId: "azure_openai",
      config: JSON.stringify({
        api_key: "test-key",
        endpoint: "http://kubernetes.default.svc.cluster.local/",
      }),
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/providers/azure_openai/models`
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("provider_endpoint_error");
    // An unreachable endpoint gets the same type: the message shows the request never went out.
    expect(body.error.message).toContain("The endpoint is invalid");
  });
});
