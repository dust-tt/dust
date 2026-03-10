import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import { Readable } from "stream";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

// Mock FileStorage to avoid GCS calls (needed for mount path resolution in markAsReady).
vi.mock("@app/lib/file_storage", async () => {
  const { mockFileStorage } = await import(
    "@app/tests/utils/mocks/file_storage"
  );
  return mockFileStorage();
});

// Mock copyContent from utils/files.ts
vi.mock("@app/lib/utils/files", () => ({
  copyContent: vi.fn(),
}));

describe("FileResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchByShareTokenWithContent", () => {
    const expectedContent = "<html>Frame content</html>";

    beforeEach(() => {
      vi.spyOn(FileResource.prototype, "getSharedReadStream").mockReturnValue(
        new Readable({
          read() {
            this.push(expectedContent);
            this.push(null); // End the stream.
          },
        })
      );
    });

    it("should return file and content for active conversation", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create conversation.
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Create frame file linked to conversation.
      const frameFile = await FileFactory.create(auth, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      // Frame file should have mount path set (resolved during markAsReady).
      const row = await FileModel.findOne({
        where: { id: frameFile.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/${conversation.sId}/files/frame.html`
      );

      const frameShareInfo = await frameFile.getShareInfo();

      const token = frameShareInfo?.shareUrl.split("/").at(-1);
      assert(token, "Share token should be defined");

      // Should successfully fetch file.
      const result = await FileResource.fetchByShareTokenWithContent(token);

      expect(result).not.toBeNull();
      expect(result?.file.id).toBe(frameFile.id);
      expect(result?.content).toEqual(expectedContent);
    });

    it("should return null for soft-deleted conversation", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      // Create conversation.
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Create frame file linked to conversation.
      const frameFile = await FileFactory.create(auth, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      await frameFile.markAsReady(auth);

      const frameShareInfo = await frameFile.getShareInfo();

      const token = frameShareInfo?.shareUrl.split("/").at(-1);
      assert(token, "Share token should be defined");

      // Soft-delete the conversation.
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      assert(conversationResource, "Conversation resource should be defined");
      await conversationResource.updateVisibilityToDeleted();

      // Should successfully fetch file.
      const result = await FileResource.fetchByShareTokenWithContent(token);

      expect(result).toBeNull();
    });

    it("should return file and content for conversation in restricted space", async () => {
      const {
        authenticator: adminAuth,
        globalSpace,
        user: adminUser,
        workspace,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a regular user with limited access.
      const regularUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, regularUser, {
        role: "user",
      });

      // Create a restricted space only accessible to the admin user.
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const res = await restrictedSpace.addMembers(adminAuth, {
        userIds: [adminUser.sId],
      });
      assert(res.isOk(), "Failed to add member to restricted space");

      // Refresh admin auth after space membership.
      const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );

      // Create conversation in the restricted space.
      const conversation = await ConversationFactory.create(
        refreshedAdminAuth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          requestedSpaceIds: [globalSpace.id, restrictedSpace.id], // Restricted space.
          messagesCreatedAt: [new Date()],
        }
      );

      // Create frame file linked to conversation.
      const frameFile = await FileFactory.create(adminAuth, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      await frameFile.markAsReady(adminAuth);

      const frameShareInfo = await frameFile.getShareInfo();
      const token = frameShareInfo?.shareUrl.split("/").at(-1);
      assert(token, "Share token should be defined");

      // Should successfully fetch file even though conversation is in restricted space.
      // This tests that dangerouslySkipPermissionFiltering works correctly.
      const result = await FileResource.fetchByShareTokenWithContent(token);

      expect(result).not.toBeNull();
      expect(result?.file.id).toBe(frameFile.id);
      expect(result?.content).toEqual(expectedContent);
      expect(result?.shareScope).toBe("workspace");
    });
  });

  describe("copy", () => {
    const testFileContent = "test file content for copying";

    it("should successfully copy a file with new useCase and metadata", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      // Create source file.
      const sourceFile = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "source.txt",
        fileSize: testFileContent.length,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "original-conv-id" },
      });

      // Copy the file.
      const result = await FileResource.copy(auth, {
        sourceId: sourceFile.sId,
        useCase: "project_context",
        useCaseMetadata: { conversationId: "new-conv-id" },
      });

      // Verify success.
      assert(result.isOk(), "Copy should succeed");
      const copiedFile = result.value;

      // Verify the copied file has correct properties.
      expect(copiedFile.contentType).toBe(sourceFile.contentType);
      expect(copiedFile.fileName).toBe(sourceFile.fileName);
      expect(copiedFile.fileSize).toBe(sourceFile.fileSize);
      expect(copiedFile.useCase).toBe("project_context");
      expect(copiedFile.useCaseMetadata?.conversationId).toBe("new-conv-id");
      expect(copiedFile.isReady).toBe(true);
    });

    it("should return error when source file not found", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const result = await FileResource.copy(auth, {
        sourceId: "non-existent-file-id",
        useCase: "conversation",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Source file not found");
      }
    });

    it("should return error when source file is not ready", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      // Create a file that is not ready.
      const sourceFile = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "not-ready.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
      });

      const result = await FileResource.copy(auth, {
        sourceId: sourceFile.sId,
        useCase: "project_context",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("not ready for copying");
        expect(result.error.message).toContain("created");
      }
    });

    it("should return error when source file has failed status", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      // Create a failed file.
      const sourceFile = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "failed.txt",
        fileSize: 100,
        status: "failed",
        useCase: "conversation",
      });

      const result = await FileResource.copy(auth, {
        sourceId: sourceFile.sId,
        useCase: "project_context",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("not ready for copying");
      }
    });

    it("should copy file with different use case but same content type", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      const sourceFile = await FileFactory.create(auth, null, {
        contentType: "application/pdf",
        fileName: "document.pdf",
        fileSize: 5000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });

      const result = await FileResource.copy(auth, {
        sourceId: sourceFile.sId,
        useCase: "upsert_document",
        useCaseMetadata: { spaceId: "space-1" },
      });

      assert(result.isOk(), "Copy should succeed");
      const copiedFile = result.value;

      expect(copiedFile.contentType).toBe("application/pdf");
      expect(copiedFile.useCase).toBe("upsert_document");
      expect(copiedFile.useCaseMetadata?.spaceId).toBe("space-1");
      expect(copiedFile.useCaseMetadata?.conversationId).toBeUndefined();
    });
  });

  describe("mount path resolution", () => {
    it("should resolve mount path via markAsReady for conversation file", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "data.json",
        fileSize: 500,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-mark" },
      });

      await file.markAsReady(auth);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.status).toBe("ready");
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-mark/files/data.json`
      );
    });

    it("should resolve mount path for tool_output use case", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "output.csv",
        fileSize: 200,
        status: "created",
        useCase: "tool_output",
        useCaseMetadata: { conversationId: "conv-xyz" },
      });

      await file.markAsReady(auth);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-xyz/files/output.csv`
      );
    });

    it("should no-op for non-conversation use cases", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "created",
        useCase: "avatar",
      });

      await file.markAsReady(auth);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBeNull();
    });

    it("should no-op when conversationId is missing from metadata", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
      });

      await file.markAsReady(auth);

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBeNull();
    });

    it("should not re-resolve when mountFilePath is already set", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });

      // Manually set a mountFilePath in DB.
      await FileModel.update(
        { mountFilePath: "w/existing/path.txt" },
        { where: { id: file.id, workspaceId: workspace.id } }
      );

      // Reload to get fresh data, then trigger resolution via setUseCaseMetadata.
      const reloaded = await FileResource.fetchById(auth, file.sId);
      assert(reloaded, "File should exist");

      await reloaded.setUseCaseMetadata(auth, { conversationId: "conv-new" });

      // mountFilePath should remain unchanged.
      const afterResolve = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(afterResolve?.mountFilePath).toBe("w/existing/path.txt");
    });

    it("should disambiguate with sId when path is already taken", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // First file gets the clean path.
      const file1 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "report.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await file1.markAsReady(auth);

      // Second file with the same name in the same conversation.
      const file2 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "report.txt",
        fileSize: 200,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await file2.markAsReady(auth);

      const row1 = await FileModel.findOne({
        where: { id: file1.id, workspaceId: workspace.id },
      });
      const row2 = await FileModel.findOne({
        where: { id: file2.id, workspaceId: workspace.id },
      });

      expect(row1?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-1/files/report.txt`
      );
      expect(row2?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-1/files/report_${file2.sId}.txt`
      );
    });

    it("should disambiguate files without extension", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const file1 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "Makefile",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await file1.markAsReady(auth);

      const file2 = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "Makefile",
        fileSize: 200,
        status: "created",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });
      await file2.markAsReady(auth);

      const row2 = await FileModel.findOne({
        where: { id: file2.id, workspaceId: workspace.id },
      });
      expect(row2?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-1/files/Makefile_${file2.sId}`
      );
    });

    it("should resolve mount path via setUseCaseMetadata when conversationId is set retroactively", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a ready file without conversationId.
      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "attachment.pdf",
        fileSize: 300,
        status: "ready",
        useCase: "conversation",
      });

      // Set conversationId retroactively (like maybeUpsertFileAttachment does).
      await file.setUseCaseMetadata(auth, { conversationId: "conv-retro" });

      const row = await FileModel.findOne({
        where: { id: file.id, workspaceId: workspace.id },
      });
      expect(row?.mountFilePath).toBe(
        `w/${workspace.sId}/conversations/conv-retro/files/attachment.pdf`
      );
    });
  });

  describe("uploadContent dual write", () => {
    it("should write to both canonical and mount path when mountFilePath is set", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a frame file with conversationId and markAsReady(auth) sets mountFilePath.
      const frameFile = await FileFactory.create(auth, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-dual" },
      });

      // Verify mount path was set.
      const row = await FileModel.findOne({
        where: { id: frameFile.id, workspaceId: workspace.id },
      });
      assert(row?.mountFilePath, "Mount path should be set");

      // Clear call counts so we can track the uploadContent calls cleanly.
      vi.mocked(getPrivateUploadBucket).mockClear();

      // Upload new content (simulates a frame edit).
      await frameFile.uploadContent(auth, "<html>Updated frame</html>");

      // Collect all uploadRawContentToBucket calls across all bucket instances.
      const allUploadCalls = vi
        .mocked(getPrivateUploadBucket)
        .mock.results.flatMap((r) =>
          r.type === "return"
            ? vi.mocked(r.value.uploadRawContentToBucket).mock.calls
            : []
        );

      // Should have written to both canonical and mount path.
      const filePaths = allUploadCalls.map((call) => call[0].filePath);
      expect(filePaths).toContain(row.mountFilePath);
    });

    it("should not write to mount path when mountFilePath is not set", async () => {
      const { authenticator: auth } = await createResourceTest({
        role: "admin",
      });

      // Create a file without conversationId — no mount path.
      const file = await FileFactory.create(auth, null, {
        contentType: "text/plain",
        fileName: "plain.txt",
        fileSize: 100,
        status: "created",
        useCase: "conversation",
      });

      vi.mocked(getPrivateUploadBucket).mockClear();

      await file.uploadContent(auth, "some content");

      // Collect all uploadRawContentToBucket calls.
      const allUploadCalls = vi
        .mocked(getPrivateUploadBucket)
        .mock.results.flatMap((r) =>
          r.type === "return"
            ? vi.mocked(r.value.uploadRawContentToBucket).mock.calls
            : []
        );

      // Only canonical write, no mount path write.
      expect(allUploadCalls).toHaveLength(1);
    });
  });
});
