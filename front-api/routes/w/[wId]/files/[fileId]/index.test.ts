import { DustError } from "@app/lib/error";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/data_sources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/api/data_sources")>()),
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

vi.mock("@app/lib/api/files/processing", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("@app/lib/api/files/processing")>();
  return {
    ...mod,
    processAndStoreFile: vi.fn().mockResolvedValue({
      isErr: () => false,
      value: {},
    }),
  };
});

vi.mock("@app/lib/api/files/upsert", () => ({
  isFileTypeUpsertableForUseCase: vi.fn().mockReturnValue(true),
  processAndUpsertToDataSource: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: {},
  }),
}));

function fileUrl(workspace: { sId: string }, fileId: string, query = "") {
  return `/api/w/${workspace.sId}/files/${fileId}${query}`;
}

describe("GET /api/w/:wId/files/:fileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when file does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const response = await honoApp.request(
      fileUrl(workspace, "non-existent-file")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 404 when user cannot access conversation file", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: "non-existent-conversation",
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should redirect to signed URL for download action", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await honoApp.request(
      fileUrl(workspace, file.sId, "?action=download"),
      { redirect: "manual" }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://signed-url.test");
  });

  it("should stream file content for view action on safe files", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "image/png",
      fileName: "test.png",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await honoApp.request(
      fileUrl(workspace, file.sId, "?action=view")
    );

    expect(response.headers.get("content-type")).toBe("image/png");
  });

  it("should return 404 when user cannot read space for folders_document", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const space = await SpaceFactory.regular(workspace);

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: space.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should allow access to folders_document in global space", async () => {
    const { auth, user, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    const response = await honoApp.request(
      fileUrl(workspace, file.sId, "?action=download"),
      { redirect: "manual" }
    );

    expect(response.status).toBe(302);
  });
});

describe("DELETE /api/w/:wId/files/:fileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow builder to delete any file", async () => {
    const { auth, user, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "builder",
      });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
  });

  it("should allow file author with admin role to delete upload files", async () => {
    const { auth, user, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "admin",
      });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
  });

  it("should deny non-author without builder role from deleting upload files", async () => {
    const { auth, workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });

    const file = await FileFactory.create(auth, null, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "folders_document",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "DELETE",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "You cannot edit files in that space.",
      },
    });
  });

  it("should deny non-builder from deleting non-conversation files", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "DELETE",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `builders` for the current workspace can modify files.",
      },
    });
  });
});

describe("POST /api/w/:wId/files/:fileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow builder to upload any file", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "builder",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("file");
  });

  it("should allow file author with admin role to upload to their space", async () => {
    const { auth, user, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      status: "created",
      useCase: "upsert_table",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(200);
  });

  it("should deny non-author without builder role from uploading to space", async () => {
    const { auth, workspace, globalSpace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, null, {
      contentType: "text/csv",
      fileName: "test.csv",
      fileSize: 1024,
      status: "created",
      useCase: "upsert_table",
      useCaseMetadata: {
        spaceId: globalSpace.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "You cannot edit files in that space.",
      },
    });
  });

  it("should process conversation file and upsert to data source", async () => {
    const { processAndUpsertToDataSource } = await import(
      "@app/lib/api/files/upsert"
    );

    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "test.txt",
      fileSize: 1024,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(processAndUpsertToDataSource).toHaveBeenCalled();
  });

  it("should return a 400 with the upsert error message on invalid CSV content", async () => {
    const { processAndUpsertToDataSource } = await import(
      "@app/lib/api/files/upsert"
    );

    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/csv",
      fileName: "report.csv",
      fileSize: 1024,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
      },
    });

    const csvErrorMessage = "This CSV file is not UTF-8 encoded.";
    vi.mocked(processAndUpsertToDataSource).mockResolvedValueOnce(
      new Err(new DustError("invalid_csv_content", csvErrorMessage))
    );

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toBe(csvErrorMessage);
  });

  it("should not upsert raw sandbox delimited conversation files", async () => {
    const { processAndUpsertToDataSource } = await import(
      "@app/lib/api/files/upsert"
    );

    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/csv",
      fileName: "large.csv",
      fileSize: 1024,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        conversationId: conversation.sId,
        skipDataSourceIndexing: true,
        skipFileProcessing: true,
      },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(processAndUpsertToDataSource).not.toHaveBeenCalled();
  });
});
