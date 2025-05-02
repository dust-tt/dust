import type { RequestMethod } from "node-mocks-http";
import type { Transaction } from "sequelize";
import { beforeEach, describe, expect, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
// Import the handler directly
import handler from "@app/pages/api/w/[wId]/files/[fileId]/index";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

// Mock the FileResource methods we need
vi.mock("@app/lib/resources/file_resource", () => ({
  FileResource: {
    fetchById: vi.fn(),
  },
}));

// Mock processAndStoreFile
vi.mock("@app/lib/api/files/upload", () => ({
  processAndStoreFile: vi.fn().mockResolvedValue({ isErr: () => false }),
}));

// Mock processAndUpsertToDataSource
vi.mock("@app/lib/api/files/upsert", () => ({
  isFileTypeUpsertableForUseCase: vi.fn().mockReturnValue(true),
  processAndUpsertToDataSource: vi.fn().mockResolvedValue({ isErr: () => false }),
}));

// Mock getOrCreateConversationDataSourceFromFile
vi.mock("@app/lib/api/data_sources", () => ({
  getOrCreateConversationDataSourceFromFile: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: { id: "test_data_source" },
  }),
}));

// Setup conversation and space verification mocks
vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchById: vi.fn().mockResolvedValue({ id: "test-conversation-id" }),
    canAccessConversation: vi.fn().mockReturnValue(true),
  },
}));

vi.mock("@app/lib/resources/space_resource", () => ({
  SpaceResource: {
    fetchById: vi.fn().mockResolvedValue({ 
      id: "test-space-id",
      canRead: vi.fn().mockReturnValue(true),
    }),
  },
}));

// Mock file functionality
const mockDelete = vi.fn().mockResolvedValue({ isErr: () => false });
const mockGetSignedUrlForDownload = vi.fn().mockResolvedValue("http://signed-url.example");
const mockGetReadStream = vi.fn().mockReturnValue({
  on: vi.fn().mockImplementation(function(this: any) {
    return this;
  }),
  pipe: vi.fn(),
});

// Setup the test
async function setupTest(
  t: Transaction,
  options: {
    userRole?: "admin" | "builder" | "user";
    method?: RequestMethod;
    fileExists?: boolean;
    useCase?: string;
    useCaseMetadata?: Record<string, any>;
  } = {}
) {
  const userRole = options.userRole ?? "admin";
  const method = options.method ?? "GET";
  const fileExists = options.fileExists ?? true;
  const useCase = options.useCase ?? "conversation";
  const useCaseMetadata = options.useCaseMetadata ?? { conversationId: "test_conversation_id" };

  // Create test workspace, user with proper role
  const { req, res, workspace, user } = await createPrivateApiMockRequest({
    role: userRole,
    method: method,
  });

  // Create a mock file directly instead of using the factory
  const mockFile = fileExists ? {
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
    toJSON: () => ({
      id: "test_file_id",
      sId: "test_file_id",
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase,
    }),
  } : null;
    
  // Mock the fetchById to return our file
  vi.mocked(FileResource.fetchById).mockResolvedValue(mockFile as unknown as FileResource);

  // Setup request with proper parameter
  req.query = { 
    wId: workspace.sId, 
    fileId: fileExists ? "test_file_id" : "non-existent-file-id" 
  };

  // Create authenticator for the test
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  return {
    req,
    res,
    workspace,
    user,
    file: mockFile,
    auth
  };
}

describe("GET /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction("should return 404 for non-existent file", async (t) => {
    const { req, res } = await setupTest(t, { fileExists: false });

    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  itInTransaction("should allow any role to view file for GET request", async (t) => {
    for (const role of ["admin", "builder", "user"] as const) {
      const { req, res } = await setupTest(t, { userRole: role });
      
      // Reset for each test
      mockGetSignedUrlForDownload.mockClear();
      
      await handler(req, res);
      expect(res._getStatusCode()).toBe(302); // Should redirect to the signed URL
      expect(res._getRedirectUrl()).toBe("http://signed-url.example");
      expect(mockGetSignedUrlForDownload).toHaveBeenCalledTimes(1);
    }
  });
});

describe("POST /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction("should return 403 when user is not a builder", async (t) => {
    const { req, res } = await setupTest(t, { userRole: "user", method: "POST" });

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
    const { req, res } = await setupTest(t, { userRole: "admin", method: "POST" });

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  itInTransaction("should allow builder to modify file", async (t) => {
    const { req, res } = await setupTest(t, { userRole: "builder", method: "POST" });

    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });
});

describe("DELETE /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  itInTransaction("should return 403 when user is not a builder", async (t) => {
    const { req, res } = await setupTest(t, { userRole: "user", method: "DELETE" });

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
    const { req, res } = await setupTest(t, { userRole: "admin", method: "DELETE" });

    await handler(req, res);
    expect(res._getStatusCode()).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  itInTransaction("should allow builder to delete file", async (t) => {
    const { req, res } = await setupTest(t, { userRole: "builder", method: "DELETE" });

    await handler(req, res);
    expect(res._getStatusCode()).toBe(204);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});

describe("Method Support /api/w/[wId]/files/[fileId]", () => {
  itInTransaction("should return 405 for unsupported methods", async (t) => {
    for (const method of ["PUT", "PATCH"] as const) {
      const { req, res } = await setupTest(t, { method });

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