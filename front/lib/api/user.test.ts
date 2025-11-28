import { beforeEach, describe, expect, it } from "vitest";

import { getUserForWorkspace } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { WorkspaceType } from "@app/types";

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
      groups: [],
      workspace: null,
      subscription: null,
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
      groups: [],
      subscription: null,
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
      groups: [],
      subscription: null,
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
      groups: [],
      subscription: null,
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
      groups: [],
      subscription: null,
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
      groups: [],
      subscription: null,
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
      groups: [],
      subscription: null,
    });

    // Revoke user2's membership.
    await membership2.delete(authForRevoke, {});

    const auth = new Authenticator({
      workspace: workspace1Resource,
      user: user1,
      role: "user",
      groups: [],
      subscription: null,
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
      groups: [],
      subscription: null,
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
      groups: [],
      subscription: null,
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

    const auth = new Authenticator({
      authMethod: "session",
      workspace: workspace1Resource,
      user: superUser,
      role: "admin",
      groups: [],
      subscription: null,
    });

    const result = await getUserForWorkspace(auth, { userId: user1.sId });
    expect(result?.sId).toBe(user1.sId);
  });
});
