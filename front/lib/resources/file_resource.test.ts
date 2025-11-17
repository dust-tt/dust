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
import { GLOBAL_AGENTS_SID } from "@app/types";
import { frameContentType } from "@app/types/files";

describe("FileResource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
});
