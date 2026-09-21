import { FileResource } from "@app/lib/resources/file_resource";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/resources/file_resource", () => ({
  FileResource: {
    fetchById: vi.fn(),
  },
}));

vi.mock("@app/lib/api/files/processing", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/files/processing")>();
  return {
    ...mod,
    processAndStoreFile: vi.fn().mockResolvedValue({ isErr: () => false }),
  };
});

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchById: vi.fn().mockResolvedValue({ id: "test-conversation-id" }),
  },
}));

vi.mock("@app/lib/resources/space_resource", () => ({
  SpaceResource: {
    fetchById: vi.fn().mockResolvedValue({
      id: "test-space-id",
      getAllowedVerbs: vi.fn().mockImplementation(() => new Set(["read"])),
    }),
  },
}));

const mockDelete = vi.fn().mockResolvedValue({ isErr: () => false });
const mockGetSignedUrlForDownload = vi
  .fn()
  .mockResolvedValue("http://signed-url.example");
const mockGetReadStream = vi.fn().mockReturnValue({
  on: vi.fn().mockImplementation(function (this: any) {
    return this;
  }),
  pipe: vi.fn(),
});

function setupMockFile(
  workspace: { id: number },
  options: {
    useCase?: string;
    useCaseMetadata?: Record<string, any>;
  } = {}
) {
  const useCase = options.useCase ?? "conversation";
  const useCaseMetadata = options.useCaseMetadata ?? {
    conversationId: "test_conversation_id",
  };

  const mockFile = {
    id: "123",
    sId: "test_file_id",
    workspaceId: workspace.id,
    contentType: "application/pdf",
    fileName: "test.pdf",
    fileSize: 1024,
    status: "ready",
    useCase,
    useCaseMetadata,
    isReady: true,
    isUpsertUseCase: () => false,
    isSafeToDisplay: () => true,
    delete: mockDelete,
    getSignedUrlForDownload: mockGetSignedUrlForDownload,
    getReadStream: mockGetReadStream,
    toPublicJSON: () => ({
      id: "test_file_id",
      sId: "test_file_id",
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase,
    }),
  };

  vi.mocked(FileResource.fetchById).mockResolvedValue(
    mockFile as unknown as FileResource
  );

  return mockFile;
}

function request(
  workspace: { sId: string },
  key: { secret: string },
  fileId: string,
  options: { method?: string; query?: string } = {}
) {
  const method = options.method ?? "GET";
  const query = options.query ?? "";
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/files/${fileId}${query ? `?${query}` : ""}`,
    {
      method,
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 for non-existent file", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    vi.mocked(FileResource.fetchById).mockResolvedValue(null);

    const response = await request(workspace, key, "non-existent-file-id");
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        type: "file_not_found",
        message: "The file was not found.",
      },
    });
  });

  it("should allow API key to download file for GET request", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    setupMockFile(workspace);

    const response = await request(workspace, key, "test_file_id", {
      query: "action=download",
    });
    // Should redirect to the signed URL
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://signed-url.example");
    expect(mockGetSignedUrlForDownload).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/v1/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error for non-supported use cases for non-system keys", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    setupMockFile(workspace, {
      useCase: "folders_document",
      useCaseMetadata: { spaceId: "test-space-id" },
    });

    const response = await request(workspace, key, "test_file_id", {
      method: "POST",
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toEqual({
      type: "invalid_request_error",
      message: "The file use case is not supported by the API.",
    });
  });

  it("should allow a system key to modify non-conversation files", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });
    setupMockFile(workspace, {
      useCase: "folders_document",
      useCaseMetadata: { spaceId: "test-space-id" },
    });

    const response = await request(workspace, key, "test_file_id", {
      method: "POST",
    });
    expect(response.status).toBe(200);
  });

  it("should allow a user key to modify conversation files", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    setupMockFile(workspace, { useCase: "conversation" });

    const response = await request(workspace, key, "test_file_id", {
      method: "POST",
    });
    expect(response.status).toBe(200);
  });

  it("should allow system API key to modify any file", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });
    setupMockFile(workspace);

    const response = await request(workspace, key, "test_file_id", {
      method: "POST",
    });
    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/v1/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return error for non-supported use cases for non-system keys", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    setupMockFile(workspace, {
      useCase: "folders_document",
      useCaseMetadata: { spaceId: "test-space-id" },
    });

    const response = await request(workspace, key, "test_file_id", {
      method: "DELETE",
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toEqual({
      type: "invalid_request_error",
      message: "The file use case is not supported by the API.",
    });
  });

  it("should allow a system key to delete non-conversation files", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });
    setupMockFile(workspace, {
      useCase: "folders_document",
      useCaseMetadata: { spaceId: "test-space-id" },
    });

    const response = await request(workspace, key, "test_file_id", {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("should allow a user key to delete conversation files", async () => {
    const { workspace, key } = await createPublicApiMockRequest();
    setupMockFile(workspace, { useCase: "conversation" });

    const response = await request(workspace, key, "test_file_id", {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("should allow system API key to delete any file", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });
    setupMockFile(workspace);

    const response = await request(workspace, key, "test_file_id", {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
