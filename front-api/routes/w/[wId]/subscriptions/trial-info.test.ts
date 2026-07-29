import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function trialInfoUrl(wId: string) {
  return `/api/w/${wId}/subscriptions/trial-info`;
}

describe("GET /api/w/:wId/subscriptions/trial-info", () => {
  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(trialInfoUrl(workspace.sId));

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

    const response = await honoApp.request(trialInfoUrl(workspace.sId));

    // The default (non-trialing) subscription returns null trial days without
    // hitting Stripe, so a granted member simply clears the gate.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ trialDaysRemaining: null });
  });
});
