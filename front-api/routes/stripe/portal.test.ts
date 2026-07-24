import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_PORTAL_URL = "https://billing.stripe.com/test-portal";

vi.mock("@app/lib/plans/stripe", () => ({
  createCustomerPortalSession: vi.fn(),
}));

import { createCustomerPortalSession } from "@app/lib/plans/stripe";

function post(body: unknown) {
  return honoApp.request(`/api/stripe/portal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/stripe/portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createCustomerPortalSession).mockResolvedValue(TEST_PORTAL_URL);
  });

  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await post({ workspaceId: workspace.sId });

    expect(response.status).toBe(403);
    expect(vi.mocked(createCustomerPortalSession)).not.toHaveBeenCalled();
  });

  it("allows a member with the billing admin permission", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "billing",
    });

    const response = await post({ workspaceId: workspace.sId });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ portalUrl: TEST_PORTAL_URL });
  });
});
