import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it } from "vitest";

const CAPABILITY = { permissionType: "create", resourceType: "agent" } as const;

describe("Authenticator.hasWorkspacePermission", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);

    const admin = await UserFactory.basic();
    await MembershipFactory.associate(workspace, admin, { role: "admin" });
    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      admin.sId,
      workspace.sId
    );
  });

  // Build a non-admin member of `group` (if given) and return their authenticator.
  async function memberAuthInGroup(
    group?: Awaited<ReturnType<typeof GroupFactory.regular>>
  ): Promise<Authenticator> {
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    if (group) {
      await GroupFactory.withMembers(adminAuth, group, [user]);
    }
    return Authenticator.fromUserIdAndWorkspaceId(user.sId, workspace.sId);
  }

  it("returns true for admins unconditionally (no grant needed)", async () => {
    expect(adminAuth.isAdmin()).toBe(true);
    expect(
      await adminAuth.hasWorkspacePermission(
        CAPABILITY.permissionType,
        CAPABILITY.resourceType
      )
    ).toBe(true);
  });

  it("returns false for a non-admin without any grant", async () => {
    const auth = await memberAuthInGroup();
    expect(auth.isAdmin()).toBe(false);
    expect(
      await auth.hasWorkspacePermission(
        CAPABILITY.permissionType,
        CAPABILITY.resourceType
      )
    ).toBe(false);
  });

  it("returns true when one of the caller's groups holds the -1 grant", async () => {
    const group = await GroupFactory.regular(workspace, "eng");
    await GroupPermissionResource.grantOnAllResourcesOfType(adminAuth, {
      group,
      ...CAPABILITY,
    });
    const auth = await memberAuthInGroup(group);

    expect(
      await auth.hasWorkspacePermission(
        CAPABILITY.permissionType,
        CAPABILITY.resourceType
      )
    ).toBe(true);
    // A different verb on the same type is not granted.
    expect(await auth.hasWorkspacePermission("publish", "agent")).toBe(false);
  });

  it("returns true for everybody when the global group holds the grant", async () => {
    const globalGroup = await GroupResource.internalFetchWorkspaceGlobalGroup(
      workspace.id
    );
    if (!globalGroup) {
      throw new Error("global group should exist");
    }
    await GroupPermissionResource.grantOnAllResourcesOfType(adminAuth, {
      group: globalGroup,
      ...CAPABILITY,
    });
    const auth = await memberAuthInGroup();

    expect(
      await auth.hasWorkspacePermission(
        CAPABILITY.permissionType,
        CAPABILITY.resourceType
      )
    ).toBe(true);
  });

  it("matches a wildcard grant against any capability", async () => {
    const group = await GroupFactory.regular(workspace, "superadmins");
    await GroupPermissionResource.grantOnAllResourcesOfType(adminAuth, {
      group,
      permissionType: "*",
      resourceType: "*",
    });
    const auth = await memberAuthInGroup(group);

    expect(await auth.hasWorkspacePermission("admin", "billing")).toBe(true);
    expect(await auth.hasWorkspacePermission("read", "audit_log")).toBe(true);
  });

  it("rejects an invalid capability query, even for admins", async () => {
    // `write` is not a valid verb on `billing`; a wildcard grant must not satisfy it.
    await expect(
      adminAuth.hasWorkspacePermission("write", "billing")
    ).rejects.toThrow(/not allowed/);
  });
});
