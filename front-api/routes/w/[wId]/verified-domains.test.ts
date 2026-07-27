import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function verifiedDomainsUrl(wId: string) {
  return `/api/w/${wId}/verified-domains`;
}

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "GET", role });
}

describe("GET /api/w/:wId/verified-domains", () => {
  it("allows a manager", async () => {
    const { workspace } = await setup("manager");

    const response = await honoApp.request(verifiedDomainsUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verifiedDomains: [] });
  });

  it("allows a member with the admin:security permission", async () => {
    const { workspace, user } = await setup("user");

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

    const response = await honoApp.request(verifiedDomainsUrl(workspace.sId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verifiedDomains: [] });
  });

  it("returns 403 for a member without manager role or the admin:security permission", async () => {
    const { workspace } = await setup("user");

    const response = await honoApp.request(verifiedDomainsUrl(workspace.sId));

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });
});
