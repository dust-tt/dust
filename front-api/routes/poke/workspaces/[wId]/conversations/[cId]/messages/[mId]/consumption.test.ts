import { ConversationModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const BILLED_CREDITS = 20;

async function setupMessage() {
  const { auth, workspace } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "admin",
  });
  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(auth);
  const createdConversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const conversation = await ConversationResource.fetchById(
    auth,
    createdConversation.sId
  );
  if (!conversation) {
    throw new Error("Just-created conversation not found.");
  }
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
  });
  await ConversationResource.updateAgentMessageCostCredits(auth, {
    agentMessageModelId: agentMessage.agentMessageId,
    costCredits: BILLED_CREDITS,
  });

  return {
    auth,
    agentConfiguration,
    agentMessage,
    conversation,
    workspace,
  };
}

function getConsumption({
  workspaceId,
  conversationId,
  messageId,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
}) {
  return honoApp.request(
    `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}/messages/${messageId}/consumption`
  );
}

describe("GET /api/poke/workspaces/:wId/conversations/:cId/messages/:mId/consumption", () => {
  it("returns consumption for a deleted conversation without the customer feature flag", async () => {
    const { agentMessage, conversation, workspace } = await setupMessage();
    await ConversationModel.update(
      { visibility: "deleted" },
      { where: { id: conversation.id, workspaceId: workspace.id } }
    );

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      totalBilledCredits: BILLED_CREDITS,
      details: null,
    });
  });

  it("returns not found when the message belongs to another conversation", async () => {
    const { auth, agentConfiguration, agentMessage, conversation, workspace } =
      await setupMessage();
    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: otherConversation.sId,
      messageId: agentMessage.sId,
    });

    expect(otherConversation.sId).not.toBe(conversation.sId);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "message_not_found" },
    });
  });

  it("returns not found for an unknown conversation", async () => {
    const { agentMessage, workspace } = await setupMessage();

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: "missing-conversation",
      messageId: agentMessage.sId,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "conversation_not_found" },
    });
  });
});
