import {
  determineUserRoleFromGroups,
  getUserForWorkspace,
} from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import {
  ADMIN_GROUP_NAME,
  MANAGER_GROUP_NAME,
} from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("getUserForWorkspace", () => {
  let workspace1: WorkspaceType;
  let workspace2: WorkspaceType;
  let user1: UserResource;
  let user2: UserResource;

  beforeEach(async () => {
    // Create two workspaces.
    workspace1 = await WorkspaceFactory.basic();
    workspace2 = await WorkspaceFactory.basic();

    // Create two users.
    user1 = await UserFactory.basic();
    user2 = await UserFactory.basic();
  });

  it("should return null when auth has no workspace", async () => {
    const auth = new Authenticator({
      user: user1,
      role: "none",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      workspace: null,
      subscription: null,
      authMethod: "internal",
    });

    const result = await getUserForWorkspace(auth, { userId: user2.sId });
    expect(result).toBeNull();
  });

  it("should return null when requesting user has no membership in the auth workspace", async () => {
    // User1 is not a member of workspace1.
    // User2 is a member of workspace1.
    await MembershipFactory.associate(workspace1, user2, { role: "user" });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "none",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // User1 tries to get info about user2, but user1 is not in the workspace.
    const result = await getUserForWorkspace(auth, { userId: user2.sId });
    expect(result).toBeNull();
  });

  it("should return the user when auth user is in the same workspace as the requested user", async () => {
    // Both users are members of workspace1.
    await MembershipFactory.associate(workspace1, user1, { role: "user" });
    await MembershipFactory.associate(workspace1, user2, { role: "user" });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // User1 can get info about user2 because they're in the same workspace.
    const result = await getUserForWorkspace(auth, { userId: user2.sId });
    expect(result?.sId).toBe(user2.sId);
  });

  it("should return the user when requesting their own information", async () => {
    // User1 is a member of workspace1.
    await MembershipFactory.associate(workspace1, user1, { role: "user" });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // User1 gets their own info.
    const result = await getUserForWorkspace(auth, { userId: user1.sId });
    expect(result?.sId).toBe(user1.sId);
  });

  it("should return null when requesting user has no membership in target workspace", async () => {
    // User1 is member of workspace1.
    // User2 is member of workspace2 (different workspace).
    await MembershipFactory.associate(workspace1, user1, { role: "user" });
    await MembershipFactory.associate(workspace2, user2, { role: "user" });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // User1 tries to get user2's info, but user2 is not in workspace1.
    const result = await getUserForWorkspace(auth, { userId: user2.sId });
    expect(result).toBeNull();
  });

  it("should return null when the requested user does not exist", async () => {
    await MembershipFactory.associate(workspace1, user1, { role: "user" });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // Try to get a non-existent user.
    const result = await getUserForWorkspace(auth, {
      userId: "non-existent-user-id",
    });
    expect(result).toBeNull();
  });

  it("should return null when requested user has revoked membership", async () => {
    // Both users are members of workspace1.
    await MembershipFactory.associate(workspace1, user1, { role: "user" });
    const membership2 = await MembershipFactory.associate(workspace1, user2, {
      role: "user",
    });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    // Create an authenticator for revoking the membership.
    const authForRevoke = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "admin",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // Revoke user2's membership.
    await membership2.delete(authForRevoke, {});

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // User1 cannot see user2 because user2 no longer has an active membership.
    const result = await getUserForWorkspace(auth, { userId: user2.sId });
    expect(result).toBeNull();
  });

  it("should return null when auth user is in a different workspace than requested user", async () => {
    // User1 in workspace1, user2 in workspace2 (both members, different workspaces).
    await MembershipFactory.associate(workspace1, user1, { role: "user" });
    await MembershipFactory.associate(workspace2, user2, { role: "user" });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // User1 tries to access user2 from workspace1 context, but user2 is only in workspace2.
    const result = await getUserForWorkspace(auth, { userId: user2.sId });
    expect(result).toBeNull();
  });

  it("should allow access when both users share membership in the auth workspace even if they have other workspaces", async () => {
    // User1 is member of workspace1 and workspace2.
    // User2 is member of workspace1 only.
    await MembershipFactory.associate(workspace1, user1, { role: "user" });
    await MembershipFactory.associate(workspace2, user1, { role: "admin" });
    await MembershipFactory.associate(workspace1, user2, { role: "user" });

    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groupModelIds: [],
      permissions: GroupPermissions.empty(),
      subscription: null,
      authMethod: "internal",
    });

    // User1 can access user2 in workspace1 context.
    const result = await getUserForWorkspace(auth, { userId: user2.sId });
    expect(result?.sId).toBe(user2.sId);
  });

  it("should allow access to superuser even if not in the workspace", async () => {
    await MembershipFactory.associate(workspace1, user1, { role: "user" });

    // create a super user on the same workspace
    const superUser = await UserFactory.superUser();
    const workspace1Resource = await WorkspaceResource.fetchById(
      workspace1.sId
    );
    if (!workspace1Resource) {
      throw new Error("workspace1Resource not found");
    }

    const auth = await Authenticator.fromDustSuperUser({
      user: superUser,
      wId: workspace1.sId,
    });

    const result = await getUserForWorkspace(auth, { userId: user1.sId });
    expect(result?.sId).toBe(user1.sId);
  });
});

describe("determineUserRoleFromGroups", () => {
  let workspace: WorkspaceType;
  let user: UserResource;
  let adminAuthenticator: Authenticator;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    await GroupFactory.defaults(workspace);
    user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    adminAuthenticator = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
  });

  // determineUserRoleFromGroups matches groups by name, not by kind, so a
  // regular_auto group named after the reserved group exercises the same logic
  // while allowing members to be added through the standard factory API.
  async function addUserToRoleGroup(name: string) {
    const group = await GroupFactory.regularAuto(workspace, name);
    await GroupFactory.withMembers(adminAuthenticator, group, [user]);
    return group;
  }

  it("returns 'user' when the user is in no role-granting group", async () => {
    const role = await determineUserRoleFromGroups(workspace, user);

    expect(role).toBe("user");
  });

  it("returns 'admin' when the user is in the dust-admins group", async () => {
    await addUserToRoleGroup(ADMIN_GROUP_NAME);

    const role = await determineUserRoleFromGroups(workspace, user);

    expect(role).toBe("admin");
  });

  it("grants 'manager' from the dust-managers group", async () => {
    await addUserToRoleGroup(MANAGER_GROUP_NAME);

    const role = await determineUserRoleFromGroups(workspace, user);

    expect(role).toBe("manager");
  });

  it("prioritizes 'admin' over 'manager'", async () => {
    await addUserToRoleGroup(ADMIN_GROUP_NAME);
    await addUserToRoleGroup(MANAGER_GROUP_NAME);

    const role = await determineUserRoleFromGroups(workspace, user);

    expect(role).toBe("admin");
  });
});
