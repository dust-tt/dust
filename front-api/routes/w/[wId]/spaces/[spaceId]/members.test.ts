import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function patchMembers(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(`/api/w/${workspace.sId}/spaces/${spaceId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postMembers(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(`/api/w/${workspace.sId}/spaces/${spaceId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/spaces/:spaceId/members", () => {
  it("lets a non-member admin add themselves to a restricted space", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);
    expect(space.isMember(auth)).toBe(false);

    const response = await postMembers(workspace, space.sId, {
      memberIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.space.sId).toBe(space.sId);

    const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const refreshedSpace = await SpaceResource.fetchById(
      refreshedAuth,
      space.sId
    );
    expect(refreshedSpace?.isMember(refreshedAuth)).toBe(true);
  });

  it("keeps the existing members", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);
    const { agentOwner: existingMember } = await setupAgentOwner(
      workspace,
      "user"
    );
    await space.addMembers(auth, { userIds: [existingMember.sId] });

    const response = await postMembers(workspace, space.sId, {
      memberIds: [user.sId],
    });
    expect(response.status).toBe(200);

    const members = await space.fetchDistinctActiveManualGroupMembers(auth);
    expect(new Set(members.map((m) => m.sId))).toEqual(
      new Set([existingMember.sId, user.sId])
    );
  });

  it("rejects non-admins", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "builder",
    });
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceFactory.defaults(internalAdminAuth);
    const space = await SpaceFactory.regular(workspace);
    await space.addMembers(internalAdminAuth, { userIds: [user.sId] });
    expect(space.isMember(auth)).toBe(false);

    const { agentOwner: otherUser } = await setupAgentOwner(workspace, "user");
    const response = await postMembers(workspace, space.sId, {
      memberIds: [otherUser.sId],
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 for an unknown user", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);

    const response = await postMembers(workspace, space.sId, {
      memberIds: ["usr_does_not_exist"],
    });

    expect(response.status).toBe(404);
  });

  it("rejects more than 100 members at once", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);

    const response = await postMembers(workspace, space.sId, {
      memberIds: Array.from({ length: 101 }, (_, i) => `usr_${i}`),
    });

    expect(response.status).toBe(400);
  });

  it("rejects an empty member list", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);

    const response = await postMembers(workspace, space.sId, {
      memberIds: [],
    });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/w/:wId/spaces/:spaceId/members", () => {
  it("blocks making a restricted project open when open projects are disabled", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    await WorkspaceResource.updateMetadata(workspace.id, {
      ...(workspace.metadata ?? {}),
      allowOpenProjects: false,
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const response = await patchMembers(workspace, project.sId, {
      name: project.name,
      isRestricted: false,
      memberIds: [],
      editorIds: [user.sId],
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Open projects are disabled by your workspace admin. Keep this project private.",
      },
    });
  });

  it("sets the members and the groups from one request", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);

    const provisionedGroup = await GroupFactory.provisioned(
      workspace,
      "Provisioned"
    );
    const response = await patchMembers(workspace, space.sId, {
      name: space.name,
      isRestricted: true,
      memberIds: [user.sId],
      groupIds: [provisionedGroup.sId],
    });
    expect(response.status).toBe(200);

    const refreshedSpace = await SpaceResource.fetchById(auth, space.sId);
    const attached = await refreshedSpace!.fetchAttachedManageableGroups(auth);
    expect(attached.memberGroups.map((g) => g.sId)).toEqual([
      provisionedGroup.sId,
    ]);

    const memberGroup = await refreshedSpace!.fetchManualMemberGroup(auth);
    const members = await memberGroup.getActiveMembers(auth);
    expect(members.map((m) => m.sId)).toEqual([user.sId]);
  });

  it("clears the groups when the request only carries members", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);

    const provisionedGroup = await GroupFactory.provisioned(
      workspace,
      "Provisioned"
    );
    const withGroup = await patchMembers(workspace, space.sId, {
      name: space.name,
      isRestricted: true,
      groupIds: [provisionedGroup.sId],
    });
    expect(withGroup.status).toBe(200);

    // The request carries the space's whole membership, so leaving the groups out drops them —
    // what a client switching the space back to manual access means.
    const response = await patchMembers(workspace, space.sId, {
      name: space.name,
      isRestricted: true,
      memberIds: [user.sId],
    });
    expect(response.status).toBe(200);

    const refreshedSpace = await SpaceResource.fetchById(auth, space.sId);
    const attached = await refreshedSpace!.fetchAttachedManageableGroups(auth);
    expect(attached.memberGroups).toEqual([]);
  });

  it("clears the members when the request only carries groups", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);

    const withMember = await patchMembers(workspace, space.sId, {
      name: space.name,
      isRestricted: true,
      memberIds: [user.sId],
    });
    expect(withMember.status).toBe(200);

    // The mirror of the case above: leaving the members out drops them, which is what a client
    // switching the space to group access means.
    const provisionedGroup = await GroupFactory.provisioned(
      workspace,
      "Provisioned"
    );
    const response = await patchMembers(workspace, space.sId, {
      name: space.name,
      isRestricted: true,
      groupIds: [provisionedGroup.sId],
    });
    expect(response.status).toBe(200);

    const refreshedSpace = await SpaceResource.fetchById(auth, space.sId);
    const memberGroup = await refreshedSpace!.fetchManualMemberGroup(auth);
    expect(await memberGroup.getActiveMembers(auth)).toEqual([]);

    const attached = await refreshedSpace!.fetchAttachedManageableGroups(auth);
    expect(attached.memberGroups.map((g) => g.sId)).toEqual([
      provisionedGroup.sId,
    ]);
  });

  it("adds a member to a group-backed space", async () => {
    const { workspace, user, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await SpaceFactory.defaults(auth);
    const space = await SpaceFactory.regular(workspace);

    const provisionedGroup = await GroupFactory.provisioned(
      workspace,
      "Provisioned"
    );
    const withGroup = await patchMembers(workspace, space.sId, {
      name: space.name,
      isRestricted: true,
      groupIds: [provisionedGroup.sId],
    });
    expect(withGroup.status).toBe(200);

    // A space's manual member list and its groups live side by side, so POST still adds one.
    const response = await postMembers(workspace, space.sId, {
      memberIds: [user.sId],
    });
    expect(response.status).toBe(200);

    const refreshedSpace = await SpaceResource.fetchById(auth, space.sId);
    const memberGroup = await refreshedSpace!.fetchManualMemberGroup(auth);
    const members = await memberGroup.getActiveMembers(auth);
    expect(members.map((m) => m.sId)).toEqual([user.sId]);

    // And the group is still attached.
    const attached = await refreshedSpace!.fetchAttachedManageableGroups(auth);
    expect(attached.memberGroups.map((g) => g.sId)).toEqual([
      provisionedGroup.sId,
    ]);
  });

  it("allows making a restricted project open when open projects are allowed", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const response = await patchMembers(workspace, project.sId, {
      name: project.name,
      isRestricted: false,
      memberIds: [],
      editorIds: [user.sId],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.space).toEqual(
      expect.objectContaining({
        sId: project.sId,
      })
    );
  });
});

// The global space (Company Data) is readable by the whole workspace; its member list is the set of
// people who may modify its content, on top of admins and managers.
describe("global space members", () => {
  // Whether `userId` may write to `space`, resolved from a freshly built Authenticator so the
  // grants the request wrote are visible.
  async function canWrite(
    workspace: { sId: string },
    space: SpaceResource,
    userId: string
  ): Promise<boolean> {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      userId,
      workspace.sId
    );
    const refreshed = await SpaceResource.fetchById(auth, space.sId);
    expect(refreshed).not.toBeNull();
    return auth.can("write", refreshed!);
  }

  it("adds an individual member through PATCH and gives them write", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const { agentOwner: member } = await setupAgentOwner(workspace, "user");

    expect(await canWrite(workspace, globalSpace, member.sId)).toBe(false);

    const response = await patchMembers(workspace, globalSpace.sId, {
      isRestricted: false,
      memberIds: [member.sId],
    });

    expect(response.status).toBe(200);
    expect(await canWrite(workspace, globalSpace, member.sId)).toBe(true);
  });

  it("adds members by group through PATCH and gives them write", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const { agentOwner: member } = await setupAgentOwner(workspace, "user");
    const group = await GroupFactory.provisioned(workspace, "Data owners");
    await GroupFactory.withMembers(auth, group, [member]);

    const response = await patchMembers(workspace, globalSpace.sId, {
      isRestricted: false,
      groupIds: [group.sId],
    });

    expect(response.status).toBe(200);
    expect(await canWrite(workspace, globalSpace, member.sId)).toBe(true);
  });

  it("takes individual members and groups in the same PATCH", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const { agentOwner: member } = await setupAgentOwner(workspace, "user");
    const { agentOwner: groupMember } = await setupAgentOwner(
      workspace,
      "user"
    );
    const group = await GroupFactory.provisioned(workspace, "Data owners");
    await GroupFactory.withMembers(auth, group, [groupMember]);

    const response = await patchMembers(workspace, globalSpace.sId, {
      isRestricted: false,
      memberIds: [member.sId],
      groupIds: [group.sId],
    });

    expect(response.status).toBe(200);
    expect(await canWrite(workspace, globalSpace, member.sId)).toBe(true);
    expect(await canWrite(workspace, globalSpace, groupMember.sId)).toBe(true);
  });

  it("adds an individual member through POST without replacing the list", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const { agentOwner: existingMember } = await setupAgentOwner(
      workspace,
      "user"
    );
    const { agentOwner: newMember } = await setupAgentOwner(workspace, "user");
    await globalSpace.addMembers(auth, { userIds: [existingMember.sId] });

    const response = await postMembers(workspace, globalSpace.sId, {
      memberIds: [newMember.sId],
    });

    expect(response.status).toBe(200);

    const members =
      await globalSpace.fetchDistinctActiveManualGroupMembers(auth);
    expect(new Set(members.map((m) => m.sId))).toEqual(
      new Set([existingMember.sId, newMember.sId])
    );
    expect(await canWrite(workspace, globalSpace, newMember.sId)).toBe(true);
  });

  it("rejects restricting the global space", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const response = await patchMembers(workspace, globalSpace.sId, {
      isRestricted: true,
      memberIds: [],
    });

    expect(response.status).toBe(400);
  });

  it("rejects non-admins", async () => {
    const { workspace, user, globalSpace } = await createPrivateApiMockRequest({
      role: "builder",
    });

    const response = await patchMembers(workspace, globalSpace.sId, {
      isRestricted: false,
      memberIds: [user.sId],
    });

    expect(response.status).toBe(403);
  });
});
