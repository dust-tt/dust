import { describe, expect, it, vi } from "vitest";

import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./rename";

// Mock FileStorage to avoid GCS calls
vi.mock("@app/lib/file_storage", () => {
  const createMockGCSFile = () => ({
    createReadStream: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation(function (this: any) {
        return this;
      }),
      pipe: vi.fn(),
    }),
    getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url.test"]),
    createWriteStream: vi.fn().mockReturnValue({
      on: vi.fn().mockImplementation(function (
        this: any,
        event: string,
        cb: any
      ) {
        if (event === "finish") {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          setImmediate(cb);
        }
        return this;
      }),
      write: vi.fn(),
      end: vi.fn(),
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    publicUrl: vi.fn().mockReturnValue("https://public-url.test"),
  });

  const createMockFileStorage = () => ({
    file: vi.fn(createMockGCSFile),
    getSignedUrl: vi.fn().mockResolvedValue("https://signed-url.test"),
    uploadFileToBucket: vi.fn().mockResolvedValue(undefined),
    uploadRawContentToBucket: vi.fn().mockResolvedValue(undefined),
    fetchFileContent: vi.fn().mockResolvedValue("mock content"),
    delete: vi.fn().mockResolvedValue(undefined),
  });

  return {
    FileStorage: vi.fn().mockImplementation(createMockFileStorage),
    getPrivateUploadBucket: vi.fn(createMockFileStorage),
    getPublicUploadBucket: vi.fn(createMockFileStorage),
    getUpsertQueueBucket: vi.fn(createMockFileStorage),
  };
});

describe("PATCH /api/w/[wId]/files/[fileId]/rename", () => {
  it("should return 404 when file does not exist", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    req.query = {
      ...req.query,
      fileId: "non-existent-file",
    };
    req.body = { fileName: "new-name.txt" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 when fileName is missing", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "fileName is required and must be a non-empty string.",
      },
    });
  });

  it("should return 400 when fileName is empty", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { fileName: "   " };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "fileName is required and must be a non-empty string.",
      },
    });
  });

  it("should allow builder to rename any file", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "old-name.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { fileName: "new-name.pdf" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().file.fileName).toBe("new-name.pdf");
  });

  it("should deny non-builder from renaming non-project files", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { fileName: "new-name.pdf" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can modify files.",
      },
    });
  });

  describe("project_context files", () => {
    it("should allow user with space write access to rename project files", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      // Enable the projects feature flag
      await FeatureFlagFactory.basic("projects", workspace);

      // Create a project space where the user is an editor (has write access)
      const projectSpace = await SpaceFactory.project(workspace, user.id);

      const file = await FileFactory.create(workspace, user, {
        contentType: "application/pdf",
        fileName: "old-name.pdf",
        fileSize: 1024,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: projectSpace.sId,
        },
      });

      req.query = {
        ...req.query,
        fileId: file.sId,
      };
      req.body = { fileName: "new-name.pdf" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().file.fileName).toBe("new-name.pdf");
    });

    it("should deny user without space write access from renaming project files", async () => {
      const { req, res, workspace, user } = await createPrivateApiMockRequest({
        method: "PATCH",
        role: "user",
      });

      // Enable the projects feature flag
      await FeatureFlagFactory.basic("projects", workspace);

      // Create a regular space (user has no access)
      const space = await SpaceFactory.regular(workspace);

      const file = await FileFactory.create(workspace, user, {
        contentType: "application/pdf",
        fileName: "test.pdf",
        fileSize: 1024,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      });

      req.query = {
        ...req.query,
        fileId: file.sId,
      };
      req.body = { fileName: "new-name.pdf" };

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "workspace_auth_error",
          message: "You cannot edit files in that space.",
        },
      });
    });
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "builder",
    });

    // Create a file so we get past the 404 check
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, PATCH is expected.",
      },
    });
  });

  it("should trim whitespace from fileName", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "builder",
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "old-name.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { fileName: "  new-name.pdf  " };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().file.fileName).toBe("new-name.pdf");
  });
});
