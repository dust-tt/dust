import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

const listGCSMountFilesMock = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/files/gcs_mount/files", () => ({
  listGCSMountFiles: listGCSMountFilesMock,
}));

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/project_files", () => {
  beforeEach(() => {
    listGCSMountFilesMock.mockReset();
  });

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

  it("returns 400 if space id is missing", async () => {
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

  it("returns 404 if space does not exist", async () => {
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

  it("returns 400 for a non-project space", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    const space = await SpaceFactory.regular(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "GCS mount files listing is only available for project spaces.",
      },
    });
  });

  it("returns 405 for unsupported method", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "POST",
    });

    const space = await SpaceFactory.project(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it("returns files for a project space and filters by updatedSince", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    const space = await SpaceFactory.project(workspace);
    req.query.spaceId = space.sId;
    req.query.updatedSince = "1000";

    const mockFile = {
      isDirectory: false as const,
      fileName: "a.txt",
      path: "project/a.txt",
      sizeBytes: 3,
      lastModifiedMs: 2000,
      contentType: "text/plain",
      fileId: null,
      thumbnailUrl: null,
    };

    listGCSMountFilesMock.mockResolvedValue([
      mockFile,
      {
        isDirectory: false as const,
        fileName: "old.txt",
        path: "project/old.txt",
        sizeBytes: 1,
        lastModifiedMs: 500,
        contentType: "text/plain",
        fileId: null,
        thumbnailUrl: null,
      },
    ]);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(listGCSMountFilesMock).toHaveBeenCalledWith(expect.anything(), {
      useCase: "project",
      projectId: space.sId,
    });
    expect(res._getJSONData()).toEqual({
      files: [mockFile],
    });
  });
});
