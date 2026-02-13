import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { describe, expect, it, vi } from "vitest";

import handler from "./signed-url";

const mockGetSignedUrl = vi.fn().mockResolvedValue("https://signed-url.test");

// Mock FileStorage to avoid GCS calls
vi.mock("@app/lib/file_storage", () => {
  const createMockFileStorage = () => ({
    file: vi.fn(() => ({
      getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url.test"]),
    })),
    getSignedUrl: mockGetSignedUrl,
  });

  return {
    FileStorage: vi.fn().mockImplementation(createMockFileStorage),
    getPrivateUploadBucket: vi.fn(createMockFileStorage),
    getPublicUploadBucket: vi.fn(createMockFileStorage),
  };
});

describe("GET /api/w/[wId]/files/[fileId]/signed-url", () => {
  it("should return 405 for non-GET requests", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    req.query = {
      ...req.query,
      fileId: "test-file-id",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  });

  it("should return 404 when file does not exist", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    req.query = {
      ...req.query,
      fileId: "non-existent-file",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 404 when file has no useCaseMetadata", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "file.docx",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: null,
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 404 when user is not a member of the file's space", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Create a regular space (user is not a member)
    const space = await SpaceFactory.regular(workspace);

    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "file.docx",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: space.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return signed URL for files in a space the user is a member of", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "test.docx",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveProperty("signedUrl");
    expect(data).not.toHaveProperty("viewerUrl");
  });

  it("should use 5 minute TTL for signed URL", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "test.docx",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // Verify getSignedUrl was called with 5 minute TTL (no promptSaveAs for inline viewing)
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        expirationDelayMs: 5 * 60 * 1000,
      })
    );
  });
});
