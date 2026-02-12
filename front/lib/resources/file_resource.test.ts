import { Readable } from "stream";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";

// Mock the processing module.
vi.mock("@app/lib/api/files/processing", () => ({
  processAndStoreFile: vi.fn(),
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
      const frameFile = await FileFactory.create(workspace, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      await frameFile.markAsReady();

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
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create conversation.
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Create frame file linked to conversation.
      const frameFile = await FileFactory.create(workspace, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      await frameFile.markAsReady();

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
      const frameFile = await FileFactory.create(workspace, null, {
        contentType: frameContentType,
        fileName: "frame.html",
        fileSize: 1000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      await frameFile.markAsReady();

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
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create source file.
      const sourceFile = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "source.txt",
        fileSize: testFileContent.length,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "original-conv-id" },
      });

      // Mock processAndStoreFile to return success.
      const { processAndStoreFile } = await import(
        "@app/lib/api/files/processing"
      );
      const mockProcessAndStoreFile = vi.mocked(processAndStoreFile);
      mockProcessAndStoreFile.mockImplementation(async (_auth, { file }) => {
        await file.markAsReady();
        return new Ok(file);
      });

      // Mock getReadStream on the FileResource prototype.
      const getReadStreamSpy = vi
        .spyOn(FileResource.prototype, "getReadStream")
        .mockReturnValue(
          new Readable({
            read() {
              this.push(testFileContent);
              this.push(null); // End the stream.
            },
          })
        );

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

      // Verify processAndStoreFile was called.
      expect(mockProcessAndStoreFile).toHaveBeenCalledOnce();
      expect(getReadStreamSpy).toHaveBeenCalledOnce();
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
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a file that is not ready.
      const sourceFile = await FileFactory.create(workspace, null, {
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
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      // Create a failed file.
      const sourceFile = await FileFactory.create(workspace, null, {
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

    it("should handle processAndStoreFile errors", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const sourceFile = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "source.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
      });

      // Mock processAndStoreFile to return an error.
      const { processAndStoreFile } = await import(
        "@app/lib/api/files/processing"
      );
      const { Err } = await import("@app/types/shared/result");
      const mockProcessAndStoreFile = vi.mocked(processAndStoreFile);
      mockProcessAndStoreFile.mockResolvedValue(
        new Err({
          name: "dust_error",
          code: "internal_server_error",
          message: "Processing failed",
        })
      );

      // Mock getReadStream.
      vi.spyOn(FileResource.prototype, "getReadStream").mockReturnValue(
        new Readable({
          read() {
            this.push("content");
            this.push(null);
          },
        })
      );

      const result = await FileResource.copy(auth, {
        sourceId: sourceFile.sId,
        useCase: "project_context",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatchObject({
          name: "dust_error",
          code: "internal_server_error",
          message: "Processing failed",
        });
      }
    });

    it("should copy file with different use case but same content type", async () => {
      const { authenticator: auth, workspace } = await createResourceTest({
        role: "admin",
      });

      const sourceFile = await FileFactory.create(workspace, null, {
        contentType: "application/pdf",
        fileName: "document.pdf",
        fileSize: 5000,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "conv-1" },
      });

      const { processAndStoreFile } = await import(
        "@app/lib/api/files/processing"
      );
      const mockProcessAndStoreFile = vi.mocked(processAndStoreFile);
      mockProcessAndStoreFile.mockImplementation(async (_auth, { file }) => {
        await file.markAsReady();
        return new Ok(file);
      });

      vi.spyOn(FileResource.prototype, "getReadStream").mockReturnValue(
        new Readable({
          read() {
            this.push("PDF content");
            this.push(null);
          },
        })
      );

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
});
