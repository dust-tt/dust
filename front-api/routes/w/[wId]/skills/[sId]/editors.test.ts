import { Authenticator } from "@app/lib/auth";
import { GroupPermissions } from "@app/lib/resources/group_permission_registry";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup() {
  const { workspace, user, globalSpace } = await createPrivateApiMockRequest({
    method: "PATCH",
    role: "admin",
  });
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  const auth = new Authenticator({
    user,
    role: "admin",
    groupModelIds: [],
    workspace: workspaceResource,
    subscription: null,
    authMethod: "internal",
    permissions: GroupPermissions.empty(),
  });
  return { workspace, user, auth, globalSpace };
}

function patch(workspace: { sId: string }, sId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}/editors`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(workspace: { sId: string }, sId: string) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/${sId}/editors`);
}

describe("PATCH /api/w/:wId/skills/:sId/editors", () => {
  it("refuses to change the editors of an archived skill", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);
    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "user",
    });

    await skill.archive(auth);

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [builderUser.sId],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "An archived skill cannot be updated. Restore it first.",
      },
    });

    const editorsResponse = await get(workspace, skill.sId);
    const editors = (await editorsResponse.json()).editors;
    expect(editors.map((e: { sId: string }) => e.sId)).not.toContain(
      builderUser.sId
    );
  });

  it("allows adding a workspace member as editor", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "user",
    });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [builderUser.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2); // admin + builder
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(
      builderUser.sId
    );
  });

  it("allows adding admin as editor", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [adminUser.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2);
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(
      adminUser.sId
    );
  });

  it("admin who is not a skill editor can become an editor", async () => {
    const { workspace, user } = await setup();

    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "user",
    });
    const builderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      builderUser.sId,
      workspace.sId
    );
    const skill = await SkillFactory.create(builderAuth);

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2);
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(
      builderUser.sId
    );
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(user.sId);
  });

  it("allows adding a regular user as editor", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [regularUser.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(2); // admin + regular user
  });

  it("allows a mixed batch of members", async () => {
    const { workspace, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const builderUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, builderUser, {
      role: "user",
    });

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [builderUser.sId, regularUser.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(3); // admin + builder + regular user
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(
      builderUser.sId
    );
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(
      regularUser.sId
    );
  });

  it("allows removing any editor regardless of role", async () => {
    const { workspace, user, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const response = await patch(workspace, skill.sId, {
      removeEditorIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(0);
  });

  it("rejects adding an editor that cannot access a restricted space the skill requires", async () => {
    const { workspace, user, auth } = await setup();

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const space = await SpaceFactory.regular(workspace);
    await space.addMembers(adminAuth, { userIds: [user.sId] });

    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [space.id],
    });

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [outsider.sId],
    });

    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.type).toBe("invalid_request_error");
    expect(error.message).toContain("do not have access");

    // The editor list is unchanged.
    const editorsResponse = await get(workspace, skill.sId);
    const data = await editorsResponse.json();
    expect(data.editors.map((e: { sId: string }) => e.sId)).toEqual([user.sId]);
  });

  it("allows adding an editor that is a member of the restricted space", async () => {
    const { workspace, user, auth } = await setup();

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const space = await SpaceFactory.regular(workspace);

    const peer = await UserFactory.basic();
    await MembershipFactory.associate(workspace, peer, { role: "user" });
    await space.addMembers(adminAuth, { userIds: [user.sId, peer.sId] });

    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [space.id],
    });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [peer.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors.map((e: { sId: string }) => e.sId)).toContain(peer.sId);
  });

  it("allows adding an editor when the skill only requires an open space", async () => {
    const { workspace, auth, globalSpace } = await setup();

    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [globalSpace.id],
    });

    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });

    const response = await patch(workspace, skill.sId, {
      addEditorIds: [outsider.sId],
    });

    expect(response.status).toBe(200);
  });

  it("GET endpoint returns all editors", async () => {
    const { workspace, user, auth } = await setup();

    const skill = await SkillFactory.create(auth);

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors).toHaveLength(1); // Creator is editor
    expect(data.editors[0].sId).toBe(user.sId);
  });

  it("GET endpoint lists the editors of a skill built on a space the admin cannot read", async () => {
    const { workspace } = await setup();
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const skillOwner = await UserFactory.basic();
    await MembershipFactory.associate(workspace, skillOwner, { role: "user" });
    const skillOwnerAuth = await Authenticator.fromUserIdAndWorkspaceId(
      skillOwner.sId,
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    await restrictedSpace.addMembers(internalAdminAuth, {
      userIds: [skillOwner.sId],
    });
    const skill = await SkillFactory.create(skillOwnerAuth, {
      name: "Restricted Space Skill",
      requestedSpaceIds: [restrictedSpace.id],
    });

    const response = await get(workspace, skill.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.editors.map((e: { sId: string }) => e.sId)).toEqual([
      skillOwner.sId,
    ]);
  });
});
