import type { RequestMethod } from "node-mocks-http";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, vi } from "vitest";

import { FileResource } from "@app/lib/resources/file_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

// Mock processAndStoreFile
vi.mock("@app/lib/api/files/upload", () => ({
  processAndStoreFile: vi.fn().mockResolvedValue({ isErr: () => false }),
}));

// Mock getOrCreateConversationDataSourceFromFile
vi.mock("@app/lib/api/data_sources", () => ({
  getOrCreateConversationDataSourceFromFile: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: { id: "test_data_source" },
  }),
}));

// Mock processAndUpsertToDataSource
vi.mock("@app/lib/api/files/upsert", () => ({
  isFileTypeUpsertableForUseCase: vi.fn().mockReturnValue(true),
  processAndUpsertToDataSource: vi.fn().mockResolvedValue({ isErr: () => false }),
}));

// Mock file.delete, getSignedUrlForDownload and file.getReadStream
const mockDelete = vi.fn().mockResolvedValue({ isErr: () => false });
const mockGetSignedUrlForDownload = vi.fn().mockResolvedValue("http://signed-url.example");
const mockGetReadStream = vi.fn().mockReturnValue({
  on: vi.fn().mockImplementation(function(this: any) {
    return this;
  }),
  pipe: vi.fn(),
});

// Mock FileResource
vi.mock("@app/lib/resources/file_resource", async () => {
  const original = await vi.importActual("@app/lib/resources/file_resource") as any;
  return {
    ...original,
    FileResource: {
      ...original.FileResource,
      fetchById: vi.fn(),
    },
  };
});

async function setupTest(
  options: {
    userRole?: "admin" | "builder" | "user";
    method?: RequestMethod;
    fileExists?: boolean;
    useCase?: string;
    useCaseMetadata?: Record<string, any>;
  } = {},
  t?: Transaction
) {
  const userRole = options.userRole ?? "admin";
  const method = options.method ?? "GET";
  const fileExists = options.fileExists ?? true;
  const useCase = options.useCase ?? "conversation";
  const useCaseMetadata = options.useCaseMetadata ?? { conversationId: "test_conversation_id" };

  const { req, res, workspace, user } = await createPrivateApiMockRequest({
    role: userRole,
    method: method,
  });

  req.query = { wId: workspace.sId, fileId: "test_file_id" };

  if (fileExists) {
    const mockFile = {
      id: "123",
      workspaceId: workspace.id,
      sId: "test_file_id",
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
      toJSON: () => ({
        id: "test_file_id",
        sId: "test_file_id",
        contentType: "application/pdf",
        fileName: "test.pdf",
        fileSize: 1024,
        status: "ready",
        useCase,
      }),
    };

    vi.mocked(FileResource.fetchById).mockResolvedValue(mockFile as unknown as FileResource);
  } else {
    vi.mocked(FileResource.fetchById).mockResolvedValue(null);
  }

  return {
    req,
    res,
    workspace,
    user,
  };
}

describe("GET /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction("should return 404 for non-existent file", async (t) => {
    const { req, res } = await setupTest({ fileExists: false }, t);

    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "Missing fileId query parameter.",
      },
    });
  });

  itInTransaction("should allow any role to view file for GET request", async (t) => {
    for (const role of ["admin", "builder", "user"] as const) {
      const { req, res } = await setupTest({ userRole: role }, t);
      
      await handler(req, res);
      expect(res._getStatusCode()).toBe(302); // Redirected to signed URL
      expect(res._getRedirectUrl()).toBe("http://signed-url.example");
    }
  });
});

describe("POST /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction("should return 403 when user is not a builder", async (t) => {
    const { req, res } = await setupTest({ userRole: "user", method: "POST" }, t);

    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only users that are `builders` for the current workspace can modify files.",
      },
    });
  });

  itInTransaction("should allow admin to modify file", async (t) => {
    const { req, res } = await setupTest({ userRole: "admin", method: "POST" }, t);

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  itInTransaction("should allow builder to modify file", async (t) => {
    const { req, res } = await setupTest({ userRole: "builder", method: "POST" }, t);

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });
});

describe("DELETE /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction("should return 403 when user is not a builder", async (t) => {
    const { req, res } = await setupTest({ userRole: "user", method: "DELETE" }, t);

    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only users that are `builders` for the current workspace can delete files.",
      },
    });
  });

  itInTransaction("should allow admin to delete file", async (t) => {
    const { req, res } = await setupTest({ userRole: "admin", method: "DELETE" }, t);

    await handler(req, res);
    expect(res._getStatusCode()).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  itInTransaction("should allow builder to delete file", async (t) => {
    const { req, res } = await setupTest({ userRole: "builder", method: "DELETE" }, t);

    await handler(req, res);
    expect(res._getStatusCode()).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});

describe("Method Support /api/w/[wId]/files/[fileId]", () => {
  itInTransaction("should return 405 for unsupported methods", async (t) => {
    for (const method of ["PUT", "PATCH"] as const) {
      const { req, res } = await setupTest({ method }, t);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });
});