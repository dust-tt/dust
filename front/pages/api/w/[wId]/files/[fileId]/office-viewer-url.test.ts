import { describe, expect, it, vi } from "vitest";

import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./office-viewer-url";

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

describe("GET /api/w/[wId]/files/[fileId]/office-viewer-url", () => {
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

  it("should return 400 for non-project_context files", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Create a conversation file (not project_context)
    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "test.docx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "some-conversation",
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Office viewer is only available for project files.",
      },
    });
  });

  it("should return 404 when user is not a project member", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Create a regular space (user is not a member)
    const space = await SpaceFactory.regular(workspace);

    // Create a project_context file in that space
    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "project-file.docx",
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

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 for non-Office compatible files", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    // Create a PDF file (not Office-compatible)
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "File is not compatible with Office viewer.",
      },
    });
  });

  it("should return viewer URL for DOCX project files", async () => {
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
      useCase: "project_context",
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
    expect(data).toHaveProperty("viewerUrl");
    expect(data.viewerUrl).toContain("view.officeapps.live.com");
  });

  it("should return viewer URL for XLSX files", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: "test.xlsx",
      fileSize: 1024,
      status: "ready",
      useCase: "project_context",
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
    expect(data.viewerUrl).toContain("view.officeapps.live.com");
  });

  it("should return viewer URL for PPTX files", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(workspace, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      fileName: "test.pptx",
      fileSize: 1024,
      status: "ready",
      useCase: "project_context",
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
    expect(data.viewerUrl).toContain("view.officeapps.live.com");
  });

  it("should return viewer URL for legacy DOC files", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/msword",
      fileName: "test.doc",
      fileSize: 1024,
      status: "ready",
      useCase: "project_context",
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
    expect(data.viewerUrl).toContain("view.officeapps.live.com");
  });

  it("should use 15 minute TTL for signed URL", async () => {
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
      useCase: "project_context",
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

    // Verify getSignedUrl was called with 15 minute TTL (no promptSaveAs for inline viewing)
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        expirationDelay: 15 * 60 * 1000,
      })
    );
  });
});
