import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function cancellationUrl(wId: string) {
  return `/api/w/${wId}/metronome/cancellation`;
}

function patch(wId: string, body: unknown) {
  return honoApp.request(cancellationUrl(wId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/w/:wId/metronome/cancellation", () => {
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
    // the subscription state (no Stripe subscription) rather than on
    // authorization.
    expect(response.status).not.toBe(403);
  });
});
