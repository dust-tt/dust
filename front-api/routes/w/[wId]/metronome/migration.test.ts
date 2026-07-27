import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function migrationUrl(wId: string) {
  return `/api/w/${wId}/metronome/migration`;
}

function patch(wId: string, body: unknown) {
  return honoApp.request(migrationUrl(wId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/w/:wId/metronome/migration", () => {
  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(migrationUrl(workspace.sId));

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

    const response = await honoApp.request(migrationUrl(workspace.sId));

    // The default subscription has no Stripe subscription, so the status is
    // derived without any external call and a granted member clears the gate.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pendingMigrationDate: null,
      willBeRefundedOnEnd: false,
    });
  });
});

describe("PATCH /api/w/:wId/metronome/migration", () => {
  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const response = await patch(workspace.sId, { action: "cancel" });

    expect(response.status).toBe(403);
  });

  it("lets a member with the billing admin permission through the auth gate", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "billing",
    });

    const response = await patch(workspace.sId, { action: "cancel" });

    // The caller clears the billing-permission gate: the request now fails on
    // the subscription state (not migrating) rather than on authorization.
    expect(response.status).not.toBe(403);
  });
});
