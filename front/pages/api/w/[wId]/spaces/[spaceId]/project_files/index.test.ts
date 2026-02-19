import { Authenticator } from "@app/lib/auth";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import handler from "./index";

describe("GET /api/w/[wId]/spaces/[spaceId]/project_files", () => {
  it("should return project files for a valid space", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    // Use the global space (user already has access)
    const space = globalSpace;

    // Create some project files
    await FileFactory.create(workspace, user, {
      contentType: "text/plain",
      fileName: "test1.txt",
      fileSize: 100,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    await FileFactory.create(workspace, user, {
      contentType: "image/png",
      fileName: "test2.png",
      fileSize: 200,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.files).toHaveLength(2);
    expect(responseData.files[0].fileName).toBeDefined();
    expect(responseData.files[0].user).toBeDefined();
    expect(responseData.files[0].user?.sId).toBe(user.sId);
  });

  it("should return empty array when space has no files", async () => {
    const { req, res, globalSpace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    req.query.spaceId = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.files).toHaveLength(0);
  });

  it("should return 404 for non-existent space", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    req.query.spaceId = "non_existent_space_id";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("space_not_found");
  });

  it("should return 404 when user cannot read space", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Create a space that the user is not a member of
    const space = await SpaceFactory.regular(workspace);

    // Create another user who owns the space
    const otherUser = await UserFactory.basic();
    await Authenticator.fromUserIdAndWorkspaceId(otherUser.sId, workspace.sId);

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("space_not_found");
  });

  it("should include user information for files with uploaders", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const space = globalSpace;

    // Create file with user
    await FileFactory.create(workspace, user, {
      contentType: "text/csv",
      fileName: "data.csv",
      fileSize: 500,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    // Create file without user
    await FileFactory.create(workspace, null, {
      contentType: "application/json",
      fileName: "data.json",
      fileSize: 300,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.files).toHaveLength(2);

    // Find the files in response
    const fileWithUserResponse = responseData.files.find(
      (f: any) => f.fileName === "data.csv"
    );
    const fileWithoutUserResponse = responseData.files.find(
      (f: any) => f.fileName === "data.json"
    );

    // File with user should have user info
    expect(fileWithUserResponse.user).toBeDefined();
    expect(fileWithUserResponse.user.sId).toBe(user.sId);
    expect(fileWithUserResponse.user.name).toBeDefined();

    // File without user should have null user
    expect(fileWithoutUserResponse.user).toBeNull();
  });

  it("should return 400 for invalid spaceId parameter", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Set spaceId to an array to make it invalid
    req.query.spaceId = ["invalid", "array"];

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("invalid_request_error");
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    req.query.spaceId = globalSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    const responseData = res._getJSONData();
    expect(responseData.error.type).toBe("method_not_supported_error");
  });

  it("should return files with correct metadata format", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const space = globalSpace;

    await FileFactory.create(workspace, user, {
      contentType: "text/markdown",
      fileName: "readme.md",
      fileSize: 1024,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: space.sId },
    });

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = res._getJSONData();
    expect(responseData.files).toHaveLength(1);

    const file = responseData.files[0];

    // Check all required fields are present
    expect(file.sId).toBeDefined();
    expect(file.id).toBe(file.sId); // id should equal sId
    expect(file.fileName).toBe("readme.md");
    expect(file.fileSize).toBe(1024);
    expect(file.contentType).toBe("text/markdown");
    expect(file.status).toBe("ready");
    expect(file.version).toBeDefined();
    expect(file.useCase).toBe("project_context");
    expect(file.useCaseMetadata).toBeDefined();
    expect(typeof file.createdAt).toBe("number");
    expect(typeof file.updatedAt).toBe("number");
  });
});
