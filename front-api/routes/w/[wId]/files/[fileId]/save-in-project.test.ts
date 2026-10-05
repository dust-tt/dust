import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

function url(workspace: { sId: string }, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/save-in-project`;
}

function postSave(workspace: { sId: string }, fileId: string, body: unknown) {
  return honoApp.request(url(workspace, fileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/files/:fileId/save-in-project", () => {
  it("should return 404 when file does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await postSave(workspace, "non-existent-file", {
      projectId: "some-project-id",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 when file is not a frame", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/pdf",
      fileName: "test.pdf",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const response = await postSave(workspace, file.sId, {
      projectId: "some-project-id",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only Frame files can be saved to a pod.",
      },
    });
  });

  it("should return 400 when file is already in a pod", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: project.sId },
    });

    const response = await postSave(workspace, file.sId, {
      projectId: project.sId,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Only conversation frame files can be saved to a pod. This file is already in a pod or has another use case.",
      },
    });
  });

  it("should return 400 when projectId is missing", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const response = await postSave(workspace, file.sId, {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("projectId");
  });

  it("should return 404 when project does not exist", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const response = await postSave(workspace, file.sId, {
      projectId: "nonexistent-project-id",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "space_not_found",
        message: "Project not found.",
      },
    });
  });

  it("should return 400 when space is not a project", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const regularSpace = await SpaceFactory.regular(workspace);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const response = await postSave(workspace, file.sId, {
      projectId: regularSpace.sId,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "The given space is not a project.",
      },
    });
  });

  it("should return 403 when user does not have write access to project", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace);

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const response = await postSave(workspace, file.sId, {
      projectId: project.sId,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "You do not have write access to this project.",
      },
    });
  });

  it("should successfully move frame file to project", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    fileStorageMock.setFileExists(() => false);

    const response = await postSave(workspace, file.sId, {
      projectId: project.sId,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.file).toBeDefined();
    expect(data.file.useCase).toBe("project_context");
    expect(data.file.useCaseMetadata.spaceId).toBe(project.sId);
    expect(data.file.useCaseMetadata.sourceConversationId).toBe(
      conversation.sId
    );
    // updateUseCase clears conversationId to avoid confusion when accessing the
    // file in project context.
    expect(data.file.useCaseMetadata.conversationId).toBeUndefined();
  });

  it("should move a Frames v2 package folder to the project", async () => {
    const { user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);
    // Pod editor rights are resolved when the authenticator is built, so rebuild it after the Pod.
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: project.id,
    });

    const sourceMountDirectory = `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Status`;
    const sourceObjects = [
      `${sourceMountDirectory}/${FRAME_MANIFEST_FILE}`,
      `${sourceMountDirectory}/index.tsx`,
    ];
    const destinationManifestMountPath = `${getPodFilesBasePath({
      workspaceId: workspace.sId,
      podId: project.sId,
    })}Status/${FRAME_MANIFEST_FILE}`;
    const frame = await FileFactory.create(auth, user, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 32,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: {
        activePublicationId: "publication-1",
        conversationId: conversation.sId,
      },
      mountFilePath: sourceObjects[0],
    });
    await frame.markFrameV2AsReadyFromMount(auth);

    fileStorageMock.setObject(sourceObjects[0], "{}");
    fileStorageMock.setObject(sourceObjects[1], "ui source");
    fileStorageMock.setFileExists(
      (filePath) => fileStorageMock.getObject(filePath) !== undefined
    );
    fileStorageMock.setFilesByPrefix((prefix) =>
      sourceObjects
        .filter(
          (name) =>
            name.startsWith(prefix) &&
            fileStorageMock.getObject(name) !== undefined
        )
        .map((name) => ({
          name,
          metadata: { contentType: "text/plain", size: "10" },
        }))
    );
    const storage = getPrivateUploadBucket();
    vi.mocked(getPrivateUploadBucket).mockReturnValue(storage);
    vi.spyOn(storage, "copyFile").mockImplementation(async (source, target) => {
      const content = fileStorageMock.getObject(source);
      if (content !== undefined) {
        fileStorageMock.setObject(target, content);
      }
      return { destinationGeneration: "mock" } as never;
    });

    const response = await postSave(workspace, frame.sId, {
      projectId: project.sId,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.file.sId).toBe(frame.sId);
    expect(data.file.useCase).toBe("project_context");
    expect(data.file.useCaseMetadata).toEqual({
      activePublicationId: "publication-1",
      sourceConversationId: conversation.sId,
      spaceId: project.sId,
    });
    const reloaded = await FileResource.fetchById(auth, frame.sId);
    expect(reloaded?.mountFilePath).toBe(destinationManifestMountPath);
    expect(fileStorageMock.getObject(destinationManifestMountPath)).toBe("{}");
  });

  it("should return 400 when a file with the same name already exists in the project", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const project = await SpaceFactory.project(workspace, user.id);

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: frameContentType,
      fileName: "test.frame",
      fileSize: 1024,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    // A file with the same name already exists at the destination in the Pod.
    fileStorageMock.setFileExists(() => true);

    const response = await postSave(workspace, file.sId, {
      projectId: project.sId,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "A file with this name already exists in the Pod.",
      },
    });
  });
});
