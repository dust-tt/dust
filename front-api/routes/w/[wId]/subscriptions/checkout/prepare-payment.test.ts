import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function preparePaymentUrl(wId: string, query: Record<string, string> = {}) {
  const qs = new URLSearchParams(query).toString();
  return `/api/w/${wId}/subscriptions/checkout/prepare-payment${
    qs ? `?${qs}` : ""
  }`;
}

describe("GET /api/w/:wId/subscriptions/checkout/prepare-payment", () => {
  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(
      preparePaymentUrl(workspace.sId, { setup_session_id: "cs_test" })
    );

    expect(response.status).toBe(403);
  });

  it("lets a member with the billing admin permission through the auth gate", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "billing",
    });

    // No setup_session_id: the caller clears the billing-permission gate and
    // fails on the missing query parameter (400) rather than on authorization.
    const response = await honoApp.request(preparePaymentUrl(workspace.sId));

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});
