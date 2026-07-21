import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GetPermissionsResponseBody } from "@app/types/api/governance";
import type { WorkspacePermissions } from "@app/types/group_permissions";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getWorkspacePermissions(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/permissions`);
}

// The exhaustive base: every concrete resource type present with no verbs. Spread and override the
// entries a test expects to be populated.
function noPermissions(): WorkspacePermissions {
  return {
    space: [],
    agent: [],
    skill: [],
    frame: [],
    billing: [],
    identity: [],
    audit_log: [],
    models_tier: [],
  };
}

describe("GET /api/w/:wId/permissions", () => {
  it("returns every type-level verb for an admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await getWorkspacePermissions(workspace);

    expect(response.status).toBe(200);
    const { workspacePermissions }: GetPermissionsResponseBody =
      await response.json();

    // Admins hold every type-level capability by default; instance-only domains
    // (space, models_tier) stay empty.
    expect(workspacePermissions).toEqual({
      ...noPermissions(),
      agent: ["create", "publish"],
      skill: ["create", "publish"],
      frame: ["invite", "publish"],
      billing: ["admin"],
      identity: ["admin"],
      audit_log: ["read"],
    });
  });

  it("returns no permissions for a regular user without grants", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await getWorkspacePermissions(workspace);

    expect(response.status).toBe(200);
    const { workspacePermissions }: GetPermissionsResponseBody =
      await response.json();

    expect(workspacePermissions).toEqual(noPermissions());
  });

  it("reflects a capability granted to everyone", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Grant with an internal admin auth, independent of the request user.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await GroupPermissionResource.setForEverybody(adminAuth, {
      grantType: "create",
      resourceType: "agent",
    });

    const response = await getWorkspacePermissions(workspace);

    expect(response.status).toBe(200);
    const { workspacePermissions }: GetPermissionsResponseBody =
      await response.json();

    expect(workspacePermissions).toEqual({
      ...noPermissions(),
      agent: ["create"],
    });
  });

  it("reflects a capability granted to a group the user belongs to", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const group = await GroupFactory.regularManual(workspace, "A");
    await GroupFactory.withMembers(adminAuth, group, [user]);
    await GroupPermissionResource.setGroups(
      adminAuth,
      { grantType: "publish", resourceType: "agent" },
      [group]
    );

    const response = await getWorkspacePermissions(workspace);

    expect(response.status).toBe(200);
    const { workspacePermissions }: GetPermissionsResponseBody =
      await response.json();

    expect(workspacePermissions).toEqual({
      ...noPermissions(),
      agent: ["publish"],
    });
  });
});
