import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type {
  GetGovernancePermissionsResponseBody,
  PatchGovernancePermissionResponseBody,
} from "@app/types/api/governance";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getGovernancePermissions(workspace: { sId: string }) {
  return honoApp.request(`/api/w/${workspace.sId}/governance-permissions`);
}

function patchGovernancePermission(
  workspace: { sId: string },
  body: Record<string, unknown>
) {
  return honoApp.request(`/api/w/${workspace.sId}/governance-permissions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

    // Admin sees every domain: agent/skill/frame/trigger plus the admin-only billing/identity.
    expect(governancePermissions).toEqual({
      "create:agent": adminsOnly("create", "agent"),
      "publish:agent": adminsOnly("publish", "agent"),
      "create:skill": adminsOnly("create", "skill"),
      "publish:skill": adminsOnly("publish", "skill"),
      "make_discoverable:skill": adminsOnly("make_discoverable", "skill"),
      "invite:frame": adminsOnly("invite", "frame"),
      "publish:frame": adminsOnly("publish", "frame"),
      "use_workspace_pool:trigger": adminsOnly("use_workspace_pool", "trigger"),
      "admin:billing": adminsOnly("admin", "billing"),
      "admin:security": adminsOnly("admin", "security"),
    });
  });

  it("returns every capability except billing and identity for a manager", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "manager",
    });

    const response = await getGovernancePermissions(workspace);

    expect(response.status).toBe(200);
    const { governancePermissions }: GetGovernancePermissionsResponseBody =
      await response.json();

    // Manager sees agent/skill/frame/trigger but never the admin-only billing/identity.
    expect(governancePermissions).toEqual({
      "create:agent": adminsOnly("create", "agent"),
      "publish:agent": adminsOnly("publish", "agent"),
      "create:skill": adminsOnly("create", "skill"),
      "publish:skill": adminsOnly("publish", "skill"),
      "make_discoverable:skill": adminsOnly("make_discoverable", "skill"),
      "invite:frame": adminsOnly("invite", "frame"),
      "publish:frame": adminsOnly("publish", "frame"),
      "use_workspace_pool:trigger": adminsOnly("use_workspace_pool", "trigger"),
    });
  });

  it("reflects the everyone and groups scopes", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    // Set up grant state with an internal admin auth, independent of the request user.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

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

describe("PATCH /api/w/:wId/governance-permissions", () => {
  it("grants a capability to everyone", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const response = await patchGovernancePermission(workspace, {
      grantType: "create",
      resourceType: "agent",
      configuration: { scope: "everyone" },
    });

    expect(response.status).toBe(200);
    const { governancePermission }: PatchGovernancePermissionResponseBody =
      await response.json();
    expect(governancePermission).toEqual({
      grantType: "create",
      resourceType: "agent",
      configuration: { scope: "everyone" },
    });

    // The change is persisted and visible on the next read.
    const getResponse = await getGovernancePermissions(workspace);
    const { governancePermissions }: GetGovernancePermissionsResponseBody =
      await getResponse.json();
    expect(governancePermissions["create:agent"]?.configuration).toEqual({
      scope: "everyone",
    });
  });

  it("grants a capability to specific groups", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    const groupA = await GroupFactory.regularManual(workspace, "A");

    const response = await patchGovernancePermission(workspace, {
      grantType: "publish",
      resourceType: "agent",
      configuration: { scope: "groups", groupIds: [groupA.sId] },
    });

    expect(response.status).toBe(200);
    const { governancePermission }: PatchGovernancePermissionResponseBody =
      await response.json();
    expect(governancePermission.configuration).toEqual({
      scope: "groups",
      groupIds: [groupA.sId],
    });
  });

  it("rejects a groups configuration referencing a non-manageable group", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    // `regular_auto` groups back spaces and are not user-managed, so they cannot be granted here.
    const autoGroup = await GroupFactory.regularAuto(workspace, "auto");

    const response = await patchGovernancePermission(workspace, {
      grantType: "publish",
      resourceType: "agent",
      configuration: { scope: "groups", groupIds: [autoGroup.sId] },
    });

    expect(response.status).toBe(400);
  });

  it("moves a capability back to admins_only", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    // Start from a non-default state so admins_only is a real transition.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await GroupPermissionResource.setForEverybody(auth, {
      grantType: "create",
      resourceType: "agent",
    });

    const response = await patchGovernancePermission(workspace, {
      grantType: "create",
      resourceType: "agent",
      configuration: { scope: "admins_only" },
    });

    expect(response.status).toBe(200);
    const { governancePermission }: PatchGovernancePermissionResponseBody =
      await response.json();
    expect(governancePermission.configuration).toEqual({
      scope: "admins_only",
    });
  });

  it("lets a manager manage an agent capability", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "manager",
    });

    const response = await patchGovernancePermission(workspace, {
      grantType: "create",
      resourceType: "agent",
      configuration: { scope: "everyone" },
    });

    expect(response.status).toBe(200);
  });

  it("forbids a manager from managing billing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "manager",
    });

    const response = await patchGovernancePermission(workspace, {
      grantType: "admin",
      resourceType: "billing",
      configuration: { scope: "everyone" },
    });

    expect(response.status).toBe(403);
  });

  it("treats a groups configuration with no groups as admins_only", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "admin",
    });

    // Start from `everyone` so persisting admins_only is a real transition.
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await GroupPermissionResource.setForEverybody(auth, {
      grantType: "create",
      resourceType: "agent",
    });

    const response = await patchGovernancePermission(workspace, {
      grantType: "create",
      resourceType: "agent",
      configuration: { scope: "groups", groupIds: [] },
    });

    expect(response.status).toBe(200);
    const { governancePermission }: PatchGovernancePermissionResponseBody =
      await response.json();
    expect(governancePermission.configuration).toEqual({
      scope: "admins_only",
    });
  });

  it("returns 403 for a non-business-admin user", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const response = await patchGovernancePermission(workspace, {
      grantType: "create",
      resourceType: "agent",
      configuration: { scope: "everyone" },
    });

    expect(response.status).toBe(403);
  });
});
