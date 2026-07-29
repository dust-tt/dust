import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "POST", role });
}

function enforceSso(workspace: { sId: string }, ssoEnforced: boolean) {
  return honoApp.request(`/api/w/${workspace.sId}/sso`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ssoEnforced }),
  });
}

describe("POST /api/w/:wId/sso", () => {
  it("lets an admin enforce SSO", async () => {
    const { workspace } = await setup();

    const response = await enforceSso(workspace, true);

    expect(response.status).toBe(200);
    expect((await response.json()).workspace.ssoEnforced).toBe(true);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(true);
  });

  it("lets a member with the admin:security permission enforce SSO", async () => {
    const { workspace, user } = await setup("user");

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

    const response = await enforceSso(workspace, true);

    expect(response.status).toBe(200);

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(true);
  });

  it("returns 403 for a member without the admin:security permission", async () => {
    const { workspace } = await setup("user");

    const response = await enforceSso(workspace, true);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "You do not have permission to manage identity and provisioning settings.",
      },
    });

    const updated = await WorkspaceResource.fetchById(workspace.sId);
    expect(updated?.ssoEnforced).toBe(false);
  });
});
