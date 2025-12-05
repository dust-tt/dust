import { beforeEach, describe, expect, it } from "vitest";

import {
  batchRenderMessages,
  softDeleteAgentMessage,
} from "@app/lib/api/assistant/messages";
import { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  Message,
  UserMessage,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
  LightAgentConfigurationType,
} from "@app/types";
import { ConversationError } from "@app/types";

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
      const allMessages = await Message.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessage,
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
      const allMessages = await Message.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessage,
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
      const allMessages = await Message.findAll({
        where: {
          conversationId: conversation.id,
          workspaceId: workspace.id,
        },
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            required: false,
          },
          {
            model: AgentMessage,
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
});

describe("softDeleteAgentMessage", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationWithoutContentType;
  let agentConfig: LightAgentConfigurationType;
  let agentMessageModel: Message;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });

    const allMessages = await Message.findAll({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
      },
      include: [
        {
          model: UserMessage,
          as: "userMessage",
          required: false,
        },
        {
          model: AgentMessage,
          as: "agentMessage",
          required: false,
        },
      ],
      order: [["rank", "ASC"]],
    });

    const foundAgentMessage = allMessages.find((m) => !!m.agentMessage);
    expect(foundAgentMessage).toBeDefined();
    agentMessageModel = foundAgentMessage!;
  });

  it("allows the user who sent the parent message to soft delete the agent message", async () => {
    const initialMessage = await Message.findByPk(agentMessageModel.id);
    expect(initialMessage?.visibility).toBe("visible");

    const result = await softDeleteAgentMessage(auth, {
      messageId: agentMessageModel.sId,
      conversation,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.success).toBe(true);
    }

    const updatedMessage = await Message.findByPk(agentMessageModel.id);
    expect(updatedMessage).not.toBeNull();
    expect(updatedMessage?.visibility).toBe("deleted");

    const secondResult = await softDeleteAgentMessage(auth, {
      messageId: agentMessageModel.sId,
      conversation,
    });
    expect(secondResult.isOk()).toBe(true);
  });

  it("returns message_not_found when the message does not exist", async () => {
    const result = await softDeleteAgentMessage(auth, {
      messageId: "non-existent-message-id",
      conversation,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ConversationError);
      expect(result.error.type).toBe("message_not_found");
    }
  });

  it("returns message_deletion_not_authorized when the agent message has no parent user message", async () => {
    const orphanAgentMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 10,
        agentConfigurationId: agentConfig.sId,
      });

    const result = await softDeleteAgentMessage(auth, {
      messageId: orphanAgentMessage.sId,
      conversation,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ConversationError);
      expect(result.error.type).toBe("message_deletion_not_authorized");
    }
  });

  it("returns message_deletion_not_authorized when a different user tries to delete the agent message", async () => {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, {
      role: "user",
    });

    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const result = await softDeleteAgentMessage(otherAuth, {
      messageId: agentMessageModel.sId,
      conversation,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ConversationError);
      expect(result.error.type).toBe("message_deletion_not_authorized");
    }
  });
});
