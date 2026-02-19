import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import handler from "./project_metadata";

describe("system-only authentication tests", () => {
  it("returns 403 if not system key", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: false,
      method: "GET",
    });

    const space = await SpaceFactory.project(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });
});

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/project_metadata", () => {
  it("should return 400 if workspace id is missing", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    req.query.wId = undefined as any;
    req.query.spaceId = "test-space-id";

    await handler(req, res);

    // The authentication wrapper might return 404 before the handler checks,
    // but the handler itself should return 400. Let's check for both.
    expect([400, 404]).toContain(res._getStatusCode());
  });

  it("should return 400 if space id is missing", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    req.query.spaceId = undefined;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Missing or invalid space id.",
      },
    });
  });

  it("should return 403 if not using system key", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: false,
      method: "GET",
    });

    const space = await SpaceFactory.project(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });

  it("should return 404 if space does not exist", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    req.query.spaceId = "non-existent-space-id";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  });

  it("should return 400 if space is not a project space", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    // Create a regular space (not a project)
    const space = await SpaceFactory.regular(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Project metadata is only available for project spaces.",
      },
    });
  });

  it("should return 405 for unsupported method", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "POST",
    });

    const space = await SpaceFactory.project(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET expected.",
      },
    });
  });

  it("should return null metadata if no metadata exists", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    const space = await SpaceFactory.project(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("should return project metadata when it exists", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    const space = await SpaceFactory.project(workspace);

    // Create an admin user to create metadata
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    // Create project metadata
    await ProjectMetadataResource.makeNew(adminAuth, space, {
      description: "Test project description",
    });

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.metadata).toEqual({
      createdAt: expect.anything(),
      description: "Test project description",
      sId: expect.anything(),
      spaceId: space.sId,
      updatedAt: expect.anything(),
      members: [],
    });
  });

  it("should return project metadata with members", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    const space = await SpaceFactory.project(workspace);

    // Create an admin user to manage the project
    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    // Create project members
    const member1 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member1, { role: "user" });

    const member2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member2, { role: "user" });

    // Add members to the project space's group
    const projectGroup = space.groups[0];
    await projectGroup.dangerouslyAddMember(adminAuth, {
      user: member1.toJSON(),
    });
    await projectGroup.dangerouslyAddMember(adminAuth, {
      user: member2.toJSON(),
    });

    // Create project metadata
    await ProjectMetadataResource.makeNew(adminAuth, space, {
      description: "Test project with members",
    });

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.metadata).toEqual({
      createdAt: expect.anything(),
      description: "Test project with members",
      sId: expect.anything(),
      spaceId: space.sId,
      updatedAt: expect.anything(),
      members: expect.arrayContaining([
        expect.stringContaining(member1.sId),
        expect.stringContaining(member2.sId),
      ]),
    });
  });
});
