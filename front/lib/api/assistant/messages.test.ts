import { beforeEach, describe, expect, it } from "vitest";

import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  Message,
  UserMessage,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentMessageType, LightAgentConfigurationType } from "@app/types";

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
