import { beforeEach, describe, expect, it } from "vitest";

import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgentMessageType,
  LightAgentConfigurationType,
  UserMessageType,
} from "@app/types";
import {
  isRichAgentMention,
  isRichUserMention,
} from "@app/types/assistant/mentions";

describe("batchRenderMessages", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let agentConfig: LightAgentConfigurationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });
  });

  describe("with a single agentMessage", () => {
    it("should automatically fetch the parent message if needed", async () => {
      // Create a conversation with a user message and agent message
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get all messages from the conversation
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      // Find the agent message
      const agentMessageModel = allMessages.find((m) => !!m.agentMessage);
      expect(agentMessageModel).toBeDefined();
      expect(agentMessageModel?.parentId).not.toBeNull();

      // Find the parent user message
      const parentUserMessage = allMessages.find(
        (m) => m.id === agentMessageModel?.parentId
      );
      expect(parentUserMessage).toBeDefined();

      // Now test: pass only the agent message (without the parent) to batchRenderMessages
      // This simulates the scenario where you're rendering a subset of messages
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [agentMessageModel!], // Only pass the agent message, not the parent
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        expect(renderedMessages.length).toBeGreaterThan(0);

        // Find the rendered agent message
        const renderedAgentMessage = renderedMessages.find(
          (m) => m.type === "agent_message"
        ) as AgentMessageType | undefined;
        expect(renderedAgentMessage).toBeDefined();

        if (renderedAgentMessage) {
          // Verify that the parent message was fetched and included
          expect(renderedAgentMessage.parentMessageId).toBe(
            parentUserMessage!.sId
          );
          expect(renderedAgentMessage.id).toBe(agentMessageModel!.id);
          expect(renderedAgentMessage.sId).toBe(agentMessageModel!.sId);
        }
      }
    });

    it("should work with parent message already included in messages array", async () => {
      // Create a conversation with a user message and agent message
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get all messages from the conversation
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      // Find the agent message and its parent
      const agentMessageModel = allMessages.find((m) => !!m.agentMessage);
      const parentUserMessage = allMessages.find(
        (m) => m.id === agentMessageModel?.parentId
      );

      expect(agentMessageModel).toBeDefined();
      expect(parentUserMessage).toBeDefined();

      // Test: pass both the parent and agent message
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [parentUserMessage!, agentMessageModel!], // Include both messages
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        expect(renderedMessages.length).toBe(2);

        const renderedAgentMessage = renderedMessages.find(
          (m) => m.type === "agent_message"
        ) as AgentMessageType | undefined;
        expect(renderedAgentMessage).toBeDefined();

        if (renderedAgentMessage) {
          expect(renderedAgentMessage.parentMessageId).toBe(
            parentUserMessage!.sId
          );
        }
      }
    });

    it("should work with light view type", async () => {
      // Create a conversation with a user message and agent message
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get all messages from the conversation
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      // Find the agent message
      const agentMessageModel = allMessages.find((m) => !!m.agentMessage);
      expect(agentMessageModel).toBeDefined();

      // Test with light view type - only pass the agent message
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [agentMessageModel!],
        "light"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        expect(renderedMessages.length).toBeGreaterThan(0);

        const renderedAgentMessage = renderedMessages.find(
          (m) => m.type === "agent_message"
        );
        expect(renderedAgentMessage).toBeDefined();
      }
    });
  });

  describe("user context updates", () => {
    it("should update user context when user is updated", async () => {
      // Create a conversation with a user message
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get the user from auth
      const user = auth.user();
      expect(user).not.toBeNull();
      if (!user) {
        throw new Error("User should be available");
      }

      // Get all messages from the conversation
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      // Find the user message
      const userMessageModel = allMessages.find((m) => !!m.userMessage);
      expect(userMessageModel).toBeDefined();
      expect(userMessageModel?.userMessage?.userId).toBe(user.id);

      // Update user information
      const newUsername = "updated_username";
      const newFirstName = "Updated";
      const newLastName = "Name";
      const newEmail = "updated@example.com";
      const newImageUrl = "https://example.com/new-avatar.png";

      await user.updateInfo(
        newUsername,
        newFirstName,
        newLastName,
        newEmail,
        user.workOSUserId
      );
      await user.updateImage(newImageUrl);

      // Render messages - the user context should reflect the updated user data
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [userMessageModel!],
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        const renderedUserMessage = renderedMessages.find(
          (m) => m.type === "user_message"
        ) as UserMessageType | undefined;

        expect(renderedUserMessage).toBeDefined();
        if (renderedUserMessage) {
          // Verify that the user context has been updated with the latest user data
          expect(renderedUserMessage.context.username).toBe(newUsername);
          expect(renderedUserMessage.context.fullName).toBe(
            `${newFirstName} ${newLastName}`
          );
          expect(renderedUserMessage.context.email).toBe(newEmail);
          expect(renderedUserMessage.context.profilePictureUrl).toBe(
            newImageUrl
          );

          // Verify that the user object itself is also updated
          expect(renderedUserMessage.user).not.toBeNull();
          if (renderedUserMessage.user) {
            expect(renderedUserMessage.user.username).toBe(newUsername);
            expect(renderedUserMessage.user.fullName).toBe(
              `${newFirstName} ${newLastName}`
            );
            expect(renderedUserMessage.user.email).toBe(newEmail);
            expect(renderedUserMessage.user.image).toBe(newImageUrl);
          }
        }
      }
    });
  });

  describe("richMentions", () => {
    it("should include richMentions for user messages with user mentions", async () => {
      // Create a conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Create another user and add them to the workspace
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get the user message
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      const userMessageModel = allMessages.find((m) => !!m.userMessage);
      expect(userMessageModel).toBeDefined();

      // Create a user mention
      await MentionModel.create({
        messageId: userMessageModel!.id,
        userId: mentionedUser.id,
        workspaceId: workspace.id,
        status: "approved",
      });

      // Render messages
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [userMessageModel!],
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        const renderedUserMessage = renderedMessages.find(
          (m) => m.type === "user_message"
        ) as UserMessageType | undefined;

        expect(renderedUserMessage).toBeDefined();
        if (renderedUserMessage) {
          expect(renderedUserMessage.richMentions).toBeDefined();
          expect(renderedUserMessage.richMentions.length).toBe(1);
          const userMention = renderedUserMessage.richMentions[0];
          expect(isRichUserMention(userMention)).toBe(true);
          if (isRichUserMention(userMention)) {
            expect(userMention.id).toBe(mentionedUser.sId);
            expect(userMention.label).toBe(mentionedUser.fullName());
          }
        }
      }
    });

    it("should include richMentions for user messages with agent mentions", async () => {
      // Create another agent configuration
      const mentionedAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Mentioned Agent",
          description: "Mentioned Agent Description",
        });

      // Create a conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get the user message
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      const userMessageModel = allMessages.find((m) => !!m.userMessage);
      expect(userMessageModel).toBeDefined();

      // Create an agent mention
      await MentionModel.create({
        messageId: userMessageModel!.id,
        agentConfigurationId: mentionedAgentConfig.sId,
        workspaceId: workspace.id,
        status: "approved",
      });

      // Render messages
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [userMessageModel!],
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        const renderedUserMessage = renderedMessages.find(
          (m) => m.type === "user_message"
        ) as UserMessageType | undefined;

        expect(renderedUserMessage).toBeDefined();
        if (renderedUserMessage) {
          expect(renderedUserMessage.richMentions).toBeDefined();
          expect(renderedUserMessage.richMentions.length).toBe(1);
          const agentMention = renderedUserMessage.richMentions[0];
          expect(isRichAgentMention(agentMention)).toBe(true);
          if (isRichAgentMention(agentMention)) {
            expect(agentMention.id).toBe(mentionedAgentConfig.sId);
            expect(agentMention.label).toBe(mentionedAgentConfig.name);
          }
        }
      }
    });

    it("should include richMentions for user messages with both user and agent mentions", async () => {
      // Create another user and agent
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const mentionedAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Mentioned Agent",
          description: "Mentioned Agent Description",
        });

      // Create a conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get the user message
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      const userMessageModel = allMessages.find((m) => !!m.userMessage);
      expect(userMessageModel).toBeDefined();

      // Create both user and agent mentions
      await MentionModel.create({
        messageId: userMessageModel!.id,
        userId: mentionedUser.id,
        workspaceId: workspace.id,
        status: "approved",
      });
      await MentionModel.create({
        messageId: userMessageModel!.id,
        agentConfigurationId: mentionedAgentConfig.sId,
        workspaceId: workspace.id,
        status: "approved",
      });

      // Render messages
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [userMessageModel!],
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        const renderedUserMessage = renderedMessages.find(
          (m) => m.type === "user_message"
        ) as UserMessageType | undefined;

        expect(renderedUserMessage).toBeDefined();
        if (renderedUserMessage) {
          expect(renderedUserMessage.richMentions).toBeDefined();
          expect(renderedUserMessage.richMentions.length).toBe(2);

          const userMention = renderedUserMessage.richMentions.find(
            (m) => m.type === "user"
          );
          const agentMention = renderedUserMessage.richMentions.find(
            (m) => m.type === "agent"
          );

          expect(userMention).toBeDefined();
          if (userMention && isRichUserMention(userMention)) {
            expect(userMention.id).toBe(mentionedUser.sId);
          }

          expect(agentMention).toBeDefined();
          if (agentMention && isRichAgentMention(agentMention)) {
            expect(agentMention.id).toBe(mentionedAgentConfig.sId);
          }
        }
      }
    });

    it("should include richMentions for agent messages with mentions", async () => {
      // Create another user and agent
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const mentionedAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Mentioned Agent",
          description: "Mentioned Agent Description",
        });

      // Create a conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get all messages
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      const agentMessageModel = allMessages.find((m) => !!m.agentMessage);
      expect(agentMessageModel).toBeDefined();

      // Create both user and agent mentions on the agent message
      await MentionModel.create({
        messageId: agentMessageModel!.id,
        userId: mentionedUser.id,
        workspaceId: workspace.id,
        status: "approved",
      });
      await MentionModel.create({
        messageId: agentMessageModel!.id,
        agentConfigurationId: mentionedAgentConfig.sId,
        workspaceId: workspace.id,
        status: "approved",
      });

      // Render messages
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [agentMessageModel!],
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        const renderedAgentMessage = renderedMessages.find(
          (m) => m.type === "agent_message"
        ) as AgentMessageType | undefined;

        expect(renderedAgentMessage).toBeDefined();
        if (renderedAgentMessage) {
          expect(renderedAgentMessage.richMentions).toBeDefined();
          expect(renderedAgentMessage.richMentions.length).toBe(2);

          const userMention = renderedAgentMessage.richMentions.find(
            (m) => m.type === "user"
          );
          const agentMention = renderedAgentMessage.richMentions.find(
            (m) => m.type === "agent"
          );

          expect(userMention).toBeDefined();
          if (userMention && isRichUserMention(userMention)) {
            expect(userMention.id).toBe(mentionedUser.sId);
          }

          expect(agentMention).toBeDefined();
          if (agentMention && isRichAgentMention(agentMention)) {
            expect(agentMention.id).toBe(mentionedAgentConfig.sId);
          }
        }
      }
    });

    it("should have empty richMentions array for messages without mentions", async () => {
      // Create a conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get all messages
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessageModel,
            as: "agentMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      const userMessageModel = allMessages.find((m) => !!m.userMessage);
      const agentMessageModel = allMessages.find((m) => !!m.agentMessage);

      expect(userMessageModel).toBeDefined();
      expect(agentMessageModel).toBeDefined();

      // Render messages
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [userMessageModel!, agentMessageModel!],
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        const renderedUserMessage = renderedMessages.find(
          (m) => m.type === "user_message"
        ) as UserMessageType | undefined;
        const renderedAgentMessage = renderedMessages.find(
          (m) => m.type === "agent_message"
        ) as AgentMessageType | undefined;

        expect(renderedUserMessage).toBeDefined();
        expect(renderedAgentMessage).toBeDefined();

        if (renderedUserMessage) {
          expect(renderedUserMessage.richMentions).toBeDefined();
          expect(renderedUserMessage.richMentions).toEqual([]);
        }

        if (renderedAgentMessage) {
          expect(renderedAgentMessage.richMentions).toBeDefined();
          expect(renderedAgentMessage.richMentions).toEqual([]);
        }
      }
    });

    it("should include richMentions in light view type", async () => {
      // Create another user
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      // Fetch the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Get the user message
      const allMessages = await MessageModel.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessageModel,
            as: "userMessage",
            required: false,
          },
        ],
        order: [["rank", "ASC"]],
      });

      const userMessageModel = allMessages.find((m) => !!m.userMessage);
      expect(userMessageModel).toBeDefined();

      // Create a user mention
      await MentionModel.create({
        messageId: userMessageModel!.id,
        userId: mentionedUser.id,
        workspaceId: workspace.id,
        status: "approved",
      });

      // Render messages with light view type
      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [userMessageModel!],
        "light"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const renderedMessages = result.value;
        const renderedUserMessage = renderedMessages.find(
          (m) => m.type === "user_message"
        ) as UserMessageType | undefined;

        expect(renderedUserMessage).toBeDefined();
        if (renderedUserMessage) {
          expect(renderedUserMessage.richMentions).toBeDefined();
          expect(renderedUserMessage.richMentions.length).toBe(1);
          const userMention = renderedUserMessage.richMentions[0];
          expect(isRichUserMention(userMention)).toBe(true);
          if (isRichUserMention(userMention)) {
            expect(userMention.id).toBe(mentionedUser.sId);
          }
        }
      }
    });
  });
});
