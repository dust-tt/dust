import { ProviderModel } from "@app/lib/resources/storage/models/apps";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function postAzureProvider(wId: string, endpoint: string) {
  return honoApp.request(`/api/w/${wId}/providers/azure_openai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config: JSON.stringify({ api_key: "test-key", endpoint }),
    }),
  });
}

describe("POST /api/w/:wId/providers/azure_openai", () => {
  it("rejects an endpoint outside Azure and stores nothing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await postAzureProvider(
      workspace.sId,
      "http://10.96.0.1/"
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("provider_endpoint_error");
    const provider = await ProviderModel.findOne({
      where: { workspaceId: workspace.id, providerId: "azure_openai" },
    });
    expect(provider).toBeNull();
  });

  it("stores an Azure endpoint", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await postAzureProvider(
      workspace.sId,
      "https://my-resource.openai.azure.com/"
    );

    expect(response.status).toBe(201);
  });
});
