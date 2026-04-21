import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isRichAgentMention,
  isRichUserMention,
} from "@app/types/assistant/mentions";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("batchRenderMessages", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let globalSpace: SpaceResource;
  let agentConfig: LightAgentConfigurationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
    globalSpace = setup.globalSpace;

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

    it("falls back to the DB for parentAgentMessageId when the handover origin is not in the batch", async () => {
      // Simulates an agent_handover in a single conversation:
      //   rank 0: initial user message
      //   rank 1: origin agent message (the handover source)
      //   rank 2: handover user message pointing back to rank 1 by sId
      //   rank 3: child agent message produced by the sub-agent
      // A single-message render of rank 3 doesn't include rank 1, so the
      // fallback has to resolve the origin from the DB.
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [new Date()],
      });

      const originAgentMessage = await MessageModel.findOne({
        where: {
          conversationId: conversation.id,
          rank: 1,
          workspaceId: workspace.id,
        },
      });
      expect(originAgentMessage).not.toBeNull();

      const handoverUserMessageRow = await UserMessageModel.create({
        userId: auth.getNonNullableUser().id,
        workspaceId: workspace.id,
        content: "continue on another agent",
        userContextUsername: "testuser",
        userContextTimezone: "UTC",
        userContextFullName: "Test User",
        userContextEmail: "test@example.com",
        userContextProfilePictureUrl: null,
        userContextOrigin: "web",
        clientSideMCPServerIds: [],
        agenticMessageType: "agent_handover",
        agenticOriginMessageId: originAgentMessage!.sId,
      });
      const handoverUserRow = await MessageModel.create({
        sId: `mes_handover_user_${Date.now()}`,
        rank: 2,
        conversationId: conversation.id,
        parentId: null,
        userMessageId: handoverUserMessageRow.id,
        workspaceId: workspace.id,
      });

      const childAgentRow =
        await ConversationFactory.createAgentMessageWithRank({
          workspace,
          conversationId: conversation.id,
          rank: 3,
          agentConfigurationId: agentConfig.sId,
          parentId: handoverUserRow.id,
        });

      const childAgentFull = await MessageModel.findOne({
        where: { id: childAgentRow.id, workspaceId: workspace.id },
        include: [
          { model: UserMessageModel, as: "userMessage", required: false },
          { model: AgentMessageModel, as: "agentMessage", required: false },
        ],
      });
      expect(childAgentFull).not.toBeNull();

      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      const result = await batchRenderMessages(
        auth,
        conversationResource!,
        [childAgentFull!],
        "full"
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const rendered = result.value.find((m) => m.type === "agent_message") as
          | AgentMessageType
          | undefined;
        expect(rendered).toBeDefined();
        expect(rendered?.parentAgentMessageId).toBe(originAgentMessage!.sId);
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

  it("batch fetches data source views for multiple content-node fragments", async () => {
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const user = auth.getNonNullableUser();

    const firstDataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      user
    );
    const secondDataSourceView = await DataSourceViewFactory.folder(
      workspace,
      globalSpace,
      user
    );
    const firstContentFragmentSId = generateRandomModelSId("cf");
    const secondContentFragmentSId = generateRandomModelSId("cf");
    const firstMessageSId = generateRandomModelSId();
    const secondMessageSId = generateRandomModelSId();

    const firstContentFragment = await ContentFragmentModel.create({
      sId: firstContentFragmentSId,
      version: "latest",
      workspaceId: workspace.id,
      title: "First content node",
      contentType: "text/plain",
      fileId: null,
      userId: user.id,
      userContextUsername: "testuser",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      sourceUrl: null,
      textBytes: null,
      nodeId: "node-1",
      nodeDataSourceViewId: firstDataSourceView.id,
      nodeType: "document",
      expiredReason: null,
    });
    const secondContentFragment = await ContentFragmentModel.create({
      sId: secondContentFragmentSId,
      version: "latest",
      workspaceId: workspace.id,
      title: "Second content node",
      contentType: "text/plain",
      fileId: null,
      userId: user.id,
      userContextUsername: "testuser",
      userContextFullName: "Test User",
      userContextEmail: "test@example.com",
      userContextProfilePictureUrl: null,
      sourceUrl: null,
      textBytes: null,
      nodeId: "node-2",
      nodeDataSourceViewId: secondDataSourceView.id,
      nodeType: "document",
      expiredReason: null,
    });

    await MessageModel.bulkCreate([
      {
        sId: firstMessageSId,
        rank: 0,
        conversationId: conversation.id,
        parentId: null,
        contentFragmentId: firstContentFragment.id,
        workspaceId: workspace.id,
      },
      {
        sId: secondMessageSId,
        rank: 1,
        conversationId: conversation.id,
        parentId: null,
        contentFragmentId: secondContentFragment.id,
        workspaceId: workspace.id,
      },
    ]);

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();
    if (!conversationResource) {
      throw new Error("Conversation resource should exist.");
    }

    const messages = await MessageModel.findAll({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
      },
      include: [
        {
          model: ContentFragmentModel,
          as: "contentFragment",
          required: true,
        },
      ],
      order: [["rank", "ASC"]],
    });

    const fetchByModelIdsSpy = vi.spyOn(
      DataSourceViewResource,
      "fetchByModelIds"
    );

    const result = await batchRenderMessages(
      auth,
      conversationResource,
      messages,
      "full"
    );

    expect(result.isOk()).toBe(true);
    expect(fetchByModelIdsSpy).toHaveBeenCalledTimes(1);
    expect(fetchByModelIdsSpy).toHaveBeenCalledWith(auth, [
      firstDataSourceView.id,
      secondDataSourceView.id,
    ]);

    fetchByModelIdsSpy.mockRestore();
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
