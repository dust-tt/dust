import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function pricingUrl(wId: string) {
  return `/api/w/${wId}/subscriptions/pricing`;
}

describe("GET /api/w/:wId/subscriptions/pricing", () => {
  it("returns 403 for a plain member (neither manager nor billing admin)", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(pricingUrl(workspace.sId));

    expect(response.status).toBe(403);
  });

  it("allows a member with the billing admin permission", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "billing",
    });

    const response = await honoApp.request(pricingUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("perSeatPricing");
  });

  it("allows a manager without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await honoApp.request(pricingUrl(workspace.sId));

    expect(response.status).toBe(200);
  });
});
