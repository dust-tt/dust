import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

import handler from "./index";

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
          // Use setImmediate instead of setTimeout for proper async handling
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

// Mock the data sources functions to avoid actual upserting
vi.mock("@app/lib/api/data_sources", () => ({
  getOrCreateConversationDataSourceFromFile: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: {
      id: "test-datasource-id",
      sId: "test-datasource-sid",
    },
  }),
  getOrCreateProjectContextDataSourceFromFile: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: {
      id: "test-project-datasource-id",
      sId: "test-project-datasource-sid",
    },
  }),
}));

// Mock the file processing functions
vi.mock("@app/lib/api/files/upload", () => ({
  processAndStoreFile: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: {},
  }),
}));

vi.mock("@app/lib/api/files/upsert", () => ({
  isFileTypeUpsertableForUseCase: vi.fn().mockReturnValue(true),
  processAndUpsertToDataSource: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: {},
  }),
}));

// Mock feature flags
vi.mock("@app/lib/auth", async () => {
  const actual: any = await vi.importActual("@app/lib/auth");
  return {
    ...actual,
    getFeatureFlags: vi.fn(async () => ["projects"]),
  };
});

describe("GET /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should return 404 when user cannot access conversation file", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Create a file with a non-existent conversation
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "non-existent-conversation",
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

  it("should redirect to signed URL for download action", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    // Create a conversation
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    // Create a file associated with the conversation
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
      action: "download",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(302);
    expect(res._getRedirectUrl()).toBe("https://signed-url.test");
  });

  it("should stream file content for view action on safe files", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    // Create a conversation
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    // Create a safe file (image)
    const file = await FileFactory.create(workspace, user, {
      contentType: "image/png",
      fileName: "test.png",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
      action: "view",
    };

    await handler(req, res);

    expect(res._getHeaders()["content-type"]).toBe("image/png");
  });

  it("should return 404 when user cannot read space for folders_document", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    // Create a regular space (user has no access)
    const space = await SpaceFactory.regular(workspace);

    // Create a file in that space
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
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

  it("should allow access to folders_document in global space", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    // Create a file in global space
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
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
      action: "download",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(302);
  });
});

describe("DELETE /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow builder to delete any file", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "builder",
      });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
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

    expect(res._getStatusCode()).toBe(204);
  });

  it("should allow file author with admin role to delete upload files", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "admin",
      });

    // Create a file in global space (admin has write access)
    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
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

    expect(res._getStatusCode()).toBe(204);
  });

  it("should deny non-author without builder role from deleting upload files", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "user",
      });

    // Create a file by a different user
    const file = await FileFactory.create(workspace, null, {
      contentType: "application/pdf",
      fileName: "test.pdf",
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

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "You cannot edit files in that space.",
      },
    });
  });

  it("should deny non-builder from deleting non-conversation files", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "DELETE",
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
});

describe("POST /api/w/[wId]/files/[fileId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow builder to upload any file", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "builder",
      });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toHaveProperty("file");
  });

  it("should allow file author with admin role to upload to their space", async () => {
    const { req, res, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

    const file = await FileFactory.create(workspace, user, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      status: "created",
      useCase: "upsert_table",
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
  });

  it("should deny non-author without builder role from uploading to space", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    // Create file with no user (simulating another user's file)
    const file = await FileFactory.create(workspace, null, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      status: "created",
      useCase: "upsert_table",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "You cannot edit files in that space.",
      },
    });
  });

  it("should process conversation file and upsert to data source", async () => {
    const { processAndUpsertToDataSource } =
      await import("@app/lib/api/files/upsert");

    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "text/plain",
      fileName: "test.txt",
      fileSize: 1024,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(processAndUpsertToDataSource).toHaveBeenCalled();
  });
});
