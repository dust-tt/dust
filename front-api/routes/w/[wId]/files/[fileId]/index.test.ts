import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import {
  getFrameBasePath,
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEmitAuditLogEvent } = vi.hoisted(() => ({
  mockEmitAuditLogEvent: vi.fn(),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return { ...actual, emitAuditLogEvent: mockEmitAuditLogEvent };
});

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

function fileUrl(workspace: { sId: string }, fileId: string, query = "") {
  return `/api/w/${workspace.sId}/files/${fileId}${query}`;
}

async function createConversationFrame(
  auth: Authenticator,
  directoryName: string
) {
  const owner = auth.getNonNullableWorkspace();
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const sourceDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: owner.sId,
    conversationId: conversation.sId,
  })}${directoryName}`;
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 128,
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });
  await frame.markFrameV2AsReadyFromMount(auth);

  return { conversationId: conversation.sId, frame, sourceDirectoryPath };
}

describe("GET /api/w/:wId/files/:fileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
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

  it("should return 404 when user cannot read an attached skill", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [restrictedSpace.id],
    });
    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "restricted.txt",
      fileSize: 1024,
      status: "ready",
      useCase: "skill_attachment",
    });
    await skill.updateSkill(auth, {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: [],
      fileAttachments: [file],
      icon: skill.icon,
      instructions: skill.instructions,
      mcpServerViews: [],
      name: skill.name,
      manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
      requestedSpaceIds: skill.requestedSpaceIds,
      userFacingDescription: skill.userFacingDescription,
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

  it("serves the active Frames v2 UI bundle", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });
    const publicationId = "active-publication";
    const frame = await FileFactory.create(auth, user, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 128,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: {
        activePublicationId: publicationId,
        conversationId: conversation.sId,
      },
    });
    const uiBundle = "export default function Frame() { return null; }";
    fileStorageMock.setObject(
      getFramePublicationUiBundlePath({
        workspaceId: workspace.sId,
        frameId: frame.sId,
        publicationId,
      }),
      uiBundle
    );

    const response = await honoApp.request(
      fileUrl(workspace, frame.sId, "?action=view")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(frameContentType);
    expect(await response.text()).toBe(uiBundle);
  });

  it("returns 404 for an unpublished Frames v2 file", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "frames_v2");
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });
    const frame = await FileFactory.create(auth, user, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 128,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    const response = await honoApp.request(
      fileUrl(workspace, frame.sId, "?action=view")
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "file_not_found",
        message: "Published Frame not found.",
      },
    });
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
    fileStorageMock.reset();
  });

  it("should allow manager to delete any file", async () => {
    const { auth, user, workspace, globalSpace } =
      await createPrivateApiMockRequest({
        method: "DELETE",
        role: "manager",
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

  it("deletes a Frames v2 package", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "manager",
    });
    const { conversationId, frame, sourceDirectoryPath } =
      await createConversationFrame(auth, "Status");
    const deletedPrefixes: string[] = [];
    fileStorageMock.setFileExists((path) => path.endsWith("/"));
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );

    const response = await honoApp.request(fileUrl(workspace, frame.sId), {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    await expect(FileResource.fetchById(auth, frame.sId)).resolves.toBeNull();
    expect(deletedPrefixes).toContain(`${sourceDirectoryPath}/`);
    expect(deletedPrefixes).toContain(
      getFrameBasePath({ workspaceId: workspace.sId, frameId: frame.sId })
    );
    expect(mockEmitAuditLogEvent).toHaveBeenCalledOnce();
    expect(mockEmitAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "frame.deleted",
        context: { location: "internal" },
        metadata: {
          active_publication_id: "",
          source_path: `conversation-${conversationId}/Status`,
        },
        targets: [
          expect.objectContaining({ id: workspace.sId, type: "workspace" }),
          { id: frame.sId, name: "Status", type: "frame" },
        ],
      })
    );
  });

  it("rejects a Frame package containing another registered Frame", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "manager",
    });
    const {
      conversationId,
      frame: parent,
      sourceDirectoryPath,
    } = await createConversationFrame(auth, "Parent");
    const child = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: FRAME_MANIFEST_FILE,
      fileSize: 128,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId },
      mountFilePath: `${sourceDirectoryPath}/Child/${FRAME_MANIFEST_FILE}`,
    });
    await child.markFrameV2AsReadyFromMount(auth);
    const deletedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );

    const response = await honoApp.request(fileUrl(workspace, parent.sId), {
      method: "DELETE",
    });

    expect(response.status).toBe(400);
    expect(mockEmitAuditLogEvent).not.toHaveBeenCalled();
    await expect(
      FileResource.fetchById(auth, parent.sId)
    ).resolves.not.toBeNull();
    await expect(
      FileResource.fetchById(auth, child.sId)
    ).resolves.not.toBeNull();
    expect(deletedPrefixes).toEqual([]);
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

  it("should deny a non-author from deleting upload files", async () => {
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

  it("should deny non-manager from deleting non-conversation files", async () => {
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
          "Only users that are `managers` for the current workspace can modify files.",
      },
    });
  });

  it("should reject deleting a file referenced by skill history", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "DELETE",
      role: "user",
    });
    const skill = await SkillFactory.create(auth);
    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "template.txt",
      fileSize: 1024,
      status: "ready",
      useCase: "skill_attachment",
    });
    const skillUpdate = {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: [],
      icon: skill.icon,
      instructions: skill.instructions,
      manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
      mcpServerViews: [],
      name: skill.name,
      requestedSpaceIds: skill.requestedSpaceIds,
      userFacingDescription: skill.userFacingDescription,
    };
    await skill.updateSkill(auth, {
      ...skillUpdate,
      fileAttachments: [file],
    });
    await skill.updateSkill(auth, {
      ...skillUpdate,
      fileAttachments: [],
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "DELETE",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message:
          "Files referenced by a skill or its version history cannot be deleted.",
      },
    });
  });
});

describe("POST /api/w/:wId/files/:fileId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should allow a skill editor to upload an attachment", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    const skill = await SkillFactory.create(auth);
    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "template.txt",
      fileSize: 1024,
      status: "created",
      useCase: "skill_attachment",
      useCaseMetadata: { skillId: skill.sId },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(200);
  });

  it("should deny a member who is not a skill editor", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    const skill = await SkillFactory.create(auth, {
      addCurrentUserAsEditor: false,
    });
    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "template.txt",
      fileSize: 1024,
      status: "created",
      useCase: "skill_attachment",
      useCaseMetadata: { skillId: skill.sId },
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Only skill editors can modify files attached to a skill.",
      },
    });
  });

  it("should allow a skill creator to upload before the skill exists", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const creatorsGroup = await GroupFactory.regularAuto(
      workspace,
      "Skill creators"
    );
    await GroupFactory.withMembers(adminAuth, creatorsGroup, [user]);
    await GroupPermissionResource.grantTypeWide(adminAuth, {
      group: creatorsGroup,
      grantType: "create",
      resourceType: "skill",
    });
    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "template.txt",
      fileSize: 1024,
      status: "created",
      useCase: "skill_attachment",
    });

    const response = await honoApp.request(fileUrl(workspace, file.sId), {
      method: "POST",
    });

    expect(response.status).toBe(200);
  });

  it("should allow a workspace member to upload any file", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
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

  it("should deny a non-author from uploading to space", async () => {
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
});
