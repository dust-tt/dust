import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

const { mockGetSignedUrl } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn().mockResolvedValue("https://signed-url.test"),
}));

vi.mock("@app/lib/file_storage", () => {
  const createMockFileStorage = () => ({
    file: vi.fn(() => ({
      copy: vi.fn().mockResolvedValue(undefined),
      getSignedUrl: vi.fn().mockResolvedValue(["https://signed-url.test"]),
    })),
    getSignedUrl: mockGetSignedUrl,
    uploadRawContentToBucket: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  });

  return {
    FileStorage: vi.fn().mockImplementation(createMockFileStorage),
    getPrivateUploadBucket: vi.fn(createMockFileStorage),
    getPublicUploadBucket: vi.fn(createMockFileStorage),
  };
});

function url(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/signed-url`;
}

describe("GET /api/w/:wId/files/:fileId/signed-url", () => {
  it("should return 404 when file does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(url(workspace, "non-existent-file"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 404 when file has no useCaseMetadata", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: "file.docx",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: null,
    });

    const response = await honoApp.request(url(workspace, file.sId));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 404 when user is not a member of the file's space", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const space = await SpaceFactory.regular(workspace);

    const file = await FileFactory.create(auth, user, {
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

    const response = await honoApp.request(url(workspace, file.sId));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return signed URL for files in a space the user is a member of", async () => {
    const { auth, user, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(auth, user, {
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

    const response = await honoApp.request(url(workspace, file.sId));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("signedUrl");
    expect(data).not.toHaveProperty("viewerUrl");
  });

  it("should use 5 minute TTL for signed URL", async () => {
    const { auth, user, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(auth, user, {
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

    const response = await honoApp.request(url(workspace, file.sId));

    expect(response.status).toBe(200);

    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        expirationDelayMs: 5 * 60 * 1000,
      })
    );
  });
});
