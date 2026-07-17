import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GetGovernancePermissionsResponseBody } from "@app/types/api/governance";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { describe, expect, it } from "vitest";

function getGovernancePermissions(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/governance-permissions`);
}

// A capability with no grants yet, so its default configuration is admins_only.
function adminsOnly(
  grantType: string,
  resourceType: string
): {
  grantType: string;
  resourceType: string;
  configuration: { scope: string };
} {
  return { grantType, resourceType, configuration: { scope: "admins_only" } };
}

describe("GET /api/w/:wId/governance-permissions", () => {
  it("returns every capability for an admin, defaulting to admins_only", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await getGovernancePermissions(workspace);

    expect(response.status).toBe(200);
    const { governancePermissions }: GetGovernancePermissionsResponseBody =
      await response.json();

    // Admin sees every domain: agent/skill/frame plus the admin-only billing/identity.
    expect(governancePermissions).toEqual({
      "create:agent": adminsOnly("create", "agent"),
      "publish:agent": adminsOnly("publish", "agent"),
      "create:skill": adminsOnly("create", "skill"),
      "publish:skill": adminsOnly("publish", "skill"),
      "invite:frame": adminsOnly("invite", "frame"),
      "publish:frame": adminsOnly("publish", "frame"),
      "admin:billing": adminsOnly("admin", "billing"),
      "admin:identity": adminsOnly("admin", "identity"),
    });
  });

  it("returns every capability except billing and identity for a business admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "business_admin",
    });

    const response = await getGovernancePermissions(workspace);

    expect(response.status).toBe(200);
    const { governancePermissions }: GetGovernancePermissionsResponseBody =
      await response.json();

    // Business admin sees agent/skill/frame but never the admin-only billing/identity.
    expect(governancePermissions).toEqual({
      "create:agent": adminsOnly("create", "agent"),
      "publish:agent": adminsOnly("publish", "agent"),
      "create:skill": adminsOnly("create", "skill"),
      "publish:skill": adminsOnly("publish", "skill"),
      "invite:frame": adminsOnly("invite", "frame"),
      "publish:frame": adminsOnly("publish", "frame"),
    });
  });

  it("reflects the everyone and groups scopes", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Set up grant state with an internal admin auth, independent of the request user.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
      workspace.id
    );
    assert(globalGroup, "global group should exist");

    await GroupPermissionResource.setForEverybody(auth, {
      grantType: "create",
      resourceType: "agent",
    });

    const groupA = await GroupFactory.regularAuto(workspace, "A");
    await GroupPermissionResource.setGroups(
      auth,
      { grantType: "publish", resourceType: "agent" },
      [groupA]
    );

    const response = await getGovernancePermissions(workspace);

    expect(response.status).toBe(200);
    const { governancePermissions }: GetGovernancePermissionsResponseBody =
      await response.json();

    expect(governancePermissions["create:agent"]?.configuration).toEqual({
      scope: "everyone",
    });
    expect(governancePermissions["publish:agent"]?.configuration).toEqual({
      scope: "groups",
      groupIds: [groupA.sId],
    });
  });

  it("returns 403 for a non-business-admin user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await getGovernancePermissions(workspace);

    expect(response.status).toBe(403);
  });
});
