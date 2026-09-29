const publishMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({ publish: publishMock }),
}));

import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import {
  publishAgentMessagesEvents,
  publishConversationRelatedEvent,
} from "@app/lib/api/assistant/streaming/events";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import assert from "assert";
import { Op } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("agent message events", () => {
  beforeEach(() => {
    publishMock.mockClear();
  });

  async function renderAgentMessage() {
    const { authenticator, workspace } = await createResourceTest({});
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { instructions: "Secret instructions" }
    );
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date()],
    });
    const conversationResource = await ConversationResource.fetchById(
      authenticator,
      conversation.sId
    );
    assert(conversationResource);
    const message = await MessageModel.findOne({
      where: {
        conversationId: conversation.id,
        workspaceId: workspace.id,
        agentMessageId: { [Op.ne]: null },
      },
      include: [{ model: AgentMessageModel, as: "agentMessage" }],
    });
    assert(message);
    const rendered = await batchRenderMessages(
      authenticator,
      conversationResource,
      [message],
      "full"
    );
    assert(rendered.isOk());
    const agentMessage = rendered.value.find(isAgentMessageType);
    assert(agentMessage);
    expect(agentMessage.configuration.instructions).toBe("Secret instructions");

    return { conversation: conversationResource.toJSON(), agentMessage };
  }

  function publishedMessages() {
    return publishMock.mock.calls
      .map(([, payload]) => JSON.parse(payload))
      .filter((event) => "message" in event);
  }

  it("publishes agent_message_new without the agent instructions", async () => {
    const { conversation, agentMessage } = await renderAgentMessage();

    await publishAgentMessagesEvents(conversation, [agentMessage]);

    const [event] = publishedMessages();
    expect(event.type).toBe("agent_message_new");
    expect(event.message.configuration.sId).toBe(
      agentMessage.configuration.sId
    );
    expect(event.message.configuration.instructions).toBeNull();
    expect(agentMessage.configuration.instructions).toBe("Secret instructions");
  });

  it.each([
    "agent_message_success",
    "agent_message_gracefully_stopped",
  ] as const)("publishes %s without the agent instructions", async (type) => {
    const { conversation, agentMessage } = await renderAgentMessage();

    await publishConversationRelatedEvent({
      conversationId: conversation.sId,
      event: {
        type,
        created: Date.now(),
        configurationId: agentMessage.configuration.sId,
        messageId: agentMessage.sId,
        message: agentMessage,
        runIds: [],
      },
      step: 0,
    });

    const [event] = publishedMessages();
    expect(event.type).toBe(type);
    expect(event.message.configuration.instructions).toBeNull();
  });
});
