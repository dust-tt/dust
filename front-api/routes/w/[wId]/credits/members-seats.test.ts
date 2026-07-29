import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function membersSeatsUrl(wId: string) {
  return `/api/w/${wId}/credits/members-seats`;
}

describe("GET /api/w/:wId/credits/members-seats", () => {
  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(membersSeatsUrl(workspace.sId));

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

    const response = await honoApp.request(membersSeatsUrl(workspace.sId));

    // A workspace with no Metronome contract skips the external seat lookup, so
    // a granted member clears the gate and gets the DB-backed member seats.
    expect(response.status).toBe(200);
  });
});
