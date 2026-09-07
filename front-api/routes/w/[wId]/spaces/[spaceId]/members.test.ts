import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
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
      managementMode: "manual",
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

  it("allows making a restricted project open when open projects are allowed", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const response = await patchMembers(workspace, project.sId, {
      name: project.name,
      isRestricted: false,
      managementMode: "manual",
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
