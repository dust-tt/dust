import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function invoicesUrl(wId: string) {
  return `/api/w/${wId}/billing/invoices`;
}

describe("GET /api/w/:wId/billing/invoices", () => {
  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(invoicesUrl(workspace.sId));

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

    const response = await honoApp.request(invoicesUrl(workspace.sId));

    // The default (non-credit-priced) plan short-circuits to an empty invoice
    // list without hitting Stripe, so a granted member simply clears the gate.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ billingInvoices: [] });
  });
});
