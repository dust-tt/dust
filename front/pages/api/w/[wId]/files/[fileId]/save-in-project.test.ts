import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import { describe, expect, it, vi } from "vitest";

import handler from "./save-in-project";

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

describe("POST /api/w/[wId]/files/[fileId]/save-in-project", () => {
  it("should return 404 when file does not exist", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    await FeatureFlagFactory.basic("projects", workspace);

    req.query = {
      ...req.query,
      fileId: "non-existent-file",
    };
    req.body = { projectId: "some-project-id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 403 when projects feature flag is not enabled", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: "some-project-id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Projects feature is not enabled for this workspace.",
      },
    });
  });

  it("should return 400 when file is not a frame", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    await FeatureFlagFactory.basic("projects", workspace);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: "some-project-id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only Frame files can be saved to a project.",
      },
    });
  });

  it("should return 400 when file is already in a project", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    await FeatureFlagFactory.basic("projects", workspace);

    const project = await SpaceFactory.project(workspace, user.id);

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: project.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: project.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Only conversation frame files can be saved to a project. This file is already in a project or has another use case.",
      },
    });
  });

  it("should return 400 when projectId is missing", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    await FeatureFlagFactory.basic("projects", workspace);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = {};

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toContain("projectId");
  });

  it("should return 404 when project does not exist", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    await FeatureFlagFactory.basic("projects", workspace);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: "nonexistent-project-id" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "space_not_found",
        message: "Project not found.",
      },
    });
  });

  it("should return 400 when space is not a project", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    await FeatureFlagFactory.basic("projects", workspace);

    const regularSpace = await SpaceFactory.regular(workspace);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: regularSpace.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "The given space is not a project.",
      },
    });
  });

  it("should return 403 when user does not have write access to project", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    await FeatureFlagFactory.basic("projects", workspace);

    // Create project without adding the user (user has no access)
    const project = await SpaceFactory.project(workspace);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: project.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "You do not have write access to this project.",
      },
    });
  });

  it("should successfully move frame file to project", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    await FeatureFlagFactory.basic("projects", workspace);

    const project = await SpaceFactory.project(workspace, user.id);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: project.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.file).toBeDefined();
    expect(data.file.useCase).toBe("project_context");
    expect(data.file.useCaseMetadata.spaceId).toBe(project.sId);
    expect(data.file.useCaseMetadata.sourceConversationId).toBe(
      conversation.sId
    );
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "user",
      });

    await FeatureFlagFactory.basic("projects", workspace);

    const project = await SpaceFactory.project(workspace, user.id);

    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(workspace, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = {
      ...req.query,
      fileId: file.sId,
    };
    req.body = { projectId: project.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "Only POST is supported.",
      },
    });
  });
});
