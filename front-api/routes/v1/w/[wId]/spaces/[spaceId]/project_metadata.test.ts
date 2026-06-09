import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getProjectMetadata(
  workspace: { sId: string },
  key: { secret: string },
  spaceId: string
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceId}/project_metadata`,
    {
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/project_metadata", () => {
  it("returns 403 if not system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: false,
    });

    const space = await SpaceFactory.project(workspace);

    const response = await getProjectMetadata(workspace, key, space.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys can perform this action.",
      },
    });
  });

  it("returns 404 if space does not exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await getProjectMetadata(
      workspace,
      key,
      "non-existent-space-id"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  });

  it("returns 400 if space is not a project space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.regular(workspace);

    const response = await getProjectMetadata(workspace, key, space.sId);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Pod metadata is only available for Pod spaces.",
      },
    });
  });

  it("returns 404 if no metadata exists", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.project(workspace);

    const response = await getProjectMetadata(workspace, key, space.sId);

    expect(response.status).toBe(404);
  });

  it("returns project metadata when it exists", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.project(workspace);

    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await ProjectMetadataResource.makeNew(adminAuth, space, {
      description: "Test project description",
    });

    const response = await getProjectMetadata(workspace, key, space.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.metadata).toEqual({
      archivedAt: null,
      createdAt: expect.anything(),
      description: "Test project description",
      lastTodoAnalysisAt: null,
      pinnedFramePath: null,
      sId: expect.anything(),
      spaceId: space.sId,
      todoGenerationEnabled: false,
      updatedAt: expect.anything(),
      members: [],
    });
  });

  it("returns project metadata with members", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.project(workspace);

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const member1 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member1, { role: "user" });

    const member2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member2, { role: "user" });

    const projectGroup = space.groups[0];
    await projectGroup.dangerouslyAddMember(adminAuth, {
      user: member1.toJSON(),
    });
    await projectGroup.dangerouslyAddMember(adminAuth, {
      user: member2.toJSON(),
    });

    await ProjectMetadataResource.makeNew(adminAuth, space, {
      description: "Test project with members",
    });

    const response = await getProjectMetadata(workspace, key, space.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.metadata.members).toEqual(
      expect.arrayContaining([
        expect.stringContaining(member1.sId),
        expect.stringContaining(member2.sId),
      ])
    );
  });
});
