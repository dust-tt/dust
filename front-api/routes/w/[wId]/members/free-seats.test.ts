import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function freeSeatsUrl(wId: string) {
  return `/api/w/${wId}/members/free-seats`;
}

describe("GET /api/w/:wId/members/free-seats", () => {
  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(freeSeatsUrl(workspace.sId));

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

    const response = await honoApp.request(freeSeatsUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("freeSeatCounts");
  });
});
