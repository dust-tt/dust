import { canAccessFileInConversation } from "@app/lib/api/viz/files";
import { Authenticator } from "@app/lib/auth";
import {
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("canAccessFileInConversation", () => {
  let workspace: LightWorkspaceType;
  let auth: Authenticator;

  beforeEach(async () => {
    vi.clearAllMocks();
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;
  });

  describe("unsupported use cases", () => {
    it("should return error for unsupported use case", async () => {
      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "user_upload" as any,
        useCaseMetadata: null,
      });

      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Unsupported file use case");
      }
    });
  });

  describe("requested conversation not found", () => {
    it("should return error when requested conversation does not exist", async () => {
      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "some-conversation-id" },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        "nonexistent-conversation-id"
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Requested conversation not found");
      }
    });
  });

  describe("conversation useCase", () => {
    it("should allow access when file belongs to the same conversation", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it("should return error when file is not associated with a conversation", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: null,
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "File is not associated with a conversation"
        );
      }
    });

    it("should return error when file conversation does not exist", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: "nonexistent-conversation-id" },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("File conversation not found");
      }
    });

    it("should deny access when file belongs to a different conversation", async () => {
      const conversation1 = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const conversation2 = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: conversation2.sId },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation1.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Access to file denied");
      }
    });

    it("should allow access when file belongs to a sub-conversation", async () => {
      // Create parent conversation
      const parentConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Get the first user message from parent conversation
      const parentUserMessage = await MessageModel.findOne({
        where: {
          conversationId: parentConversation.id,
          workspaceId: workspace.id,
        },
        order: [["rank", "ASC"]],
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: true,
          },
        ],
      });

      expect(parentUserMessage).not.toBeNull();
      expect(parentUserMessage?.userMessage).not.toBeNull();

      // Create sub-conversation
      const subConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [],
      });

      // Create a user message in sub-conversation with agenticOriginMessageId pointing to parent
      const subUserMessageRow = await UserMessageModel.create({
        userId: auth.user()?.id ?? null,
        workspaceId: workspace.id,
        content: "Test message",
        userContextUsername: "testuser",
        userContextTimezone: "UTC",
        userContextFullName: "Test User",
        userContextEmail: "test@example.com",
        userContextProfilePictureUrl: null,
        userContextOrigin: "web",
        clientSideMCPServerIds: [],
        agenticMessageType: "run_agent",
        agenticOriginMessageId: parentUserMessage!.sId,
      });

      await MessageModel.create({
        sId: generateRandomModelSId(),
        rank: 0,
        conversationId: subConversation.id,
        parentId: null,
        userMessageId: subUserMessageRow.id,
        workspaceId: workspace.id,
      });

      // Create file associated with sub-conversation
      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "conversation",
        useCaseMetadata: { conversationId: subConversation.sId },
      });

      // Should allow access from parent conversation
      const result = await canAccessFileInConversation(
        workspace,
        file,
        parentConversation.sId
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });
  });

  describe("tool_output useCase", () => {
    it("should allow access when file belongs to the same conversation", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "tool_output",
        useCaseMetadata: { conversationId: conversation.sId },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it("should allow access when file belongs to a sub-conversation", async () => {
      // Create parent conversation
      const parentConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      // Get the first user message from parent conversation
      const parentUserMessage = await MessageModel.findOne({
        where: {
          conversationId: parentConversation.id,
          workspaceId: workspace.id,
        },
        order: [["rank", "ASC"]],
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: true,
          },
        ],
      });

      expect(parentUserMessage).not.toBeNull();
      expect(parentUserMessage?.userMessage).not.toBeNull();

      // Create sub-conversation
      const subConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [],
      });

      // Create a user message in sub-conversation with agenticOriginMessageId pointing to parent
      const subUserMessageRow = await UserMessageModel.create({
        userId: auth.user()?.id ?? null,
        workspaceId: workspace.id,
        content: "Test message",
        userContextUsername: "testuser",
        userContextTimezone: "UTC",
        userContextFullName: "Test User",
        userContextEmail: "test@example.com",
        userContextProfilePictureUrl: null,
        userContextOrigin: "web",
        clientSideMCPServerIds: [],
        agenticMessageType: "run_agent",
        agenticOriginMessageId: parentUserMessage!.sId,
      });

      await MessageModel.create({
        sId: generateRandomModelSId(),
        rank: 0,
        conversationId: subConversation.id,
        parentId: null,
        userMessageId: subUserMessageRow.id,
        workspaceId: workspace.id,
      });

      // Create file associated with sub-conversation
      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "tool_output",
        useCaseMetadata: { conversationId: subConversation.sId },
      });

      // Should allow access from parent conversation
      const result = await canAccessFileInConversation(
        workspace,
        file,
        parentConversation.sId
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });
  });

  describe("project_context useCase", () => {
    it("should allow access when file belongs to the same project", async () => {
      const project = await SpaceFactory.project(workspace);

      // Add user to project group so they can access the project
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const user = auth.getNonNullableUser();
      const projectSpaceGroup = project.groups.find(
        (g) => g.kind === "regular"
      );
      if (projectSpaceGroup) {
        const addRes = await projectSpaceGroup.dangerouslyAddMember(
          internalAdminAuth,
          {
            user: user.toJSON(),
          }
        );
        if (addRes.isErr()) {
          throw new Error(
            `Failed to add user to project space group: ${addRes.error.message}`
          );
        }
      }
      await auth.refresh();

      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: project.id,
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: { spaceId: project.sId },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it("should return error when file is not associated with a project", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: null,
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe(
          "File is not associated with a project"
        );
      }
    });

    it("should return error when project does not exist", async () => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: { spaceId: "nonexistent-space-id" },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Project not found");
      }
    });

    it("should return error when space is not a project", async () => {
      const regularSpace = await SpaceFactory.regular(workspace);

      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: { spaceId: regularSpace.sId },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Project not found");
      }
    });

    it("should deny access when file belongs to a different project", async () => {
      const project1 = await SpaceFactory.project(workspace);
      const project2 = await SpaceFactory.project(workspace);

      // Add user to project1 group so they can create a conversation in it
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const user = auth.getNonNullableUser();
      const project1SpaceGroup = project1.groups.find(
        (g) => g.kind === "regular"
      );
      if (project1SpaceGroup) {
        const addRes = await project1SpaceGroup.dangerouslyAddMember(
          internalAdminAuth,
          {
            user: user.toJSON(),
          }
        );
        if (addRes.isErr()) {
          throw new Error(
            `Failed to add user to project space group: ${addRes.error.message}`
          );
        }
      }
      await auth.refresh();

      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: project1.id,
      });

      const file = await FileFactory.create(workspace, null, {
        contentType: "text/plain",
        fileName: "test.txt",
        fileSize: 100,
        status: "ready",
        useCase: "project_context",
        useCaseMetadata: { spaceId: project2.sId },
      });

      const result = await canAccessFileInConversation(
        workspace,
        file,
        conversation.sId
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toBe("Access to file denied");
      }
    });
  });
});
