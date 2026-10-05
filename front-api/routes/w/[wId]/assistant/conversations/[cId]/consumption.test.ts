import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const BILLED_CREDITS = 7;
const PREVIOUS_ATTRIBUTION_VERSION =
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION - 1;

async function setupConversation() {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "user",
    method: "GET",
  });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: "Conversation consumption endpoint" }
  );
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
  const { run, runUsageModelId } = await RunFactory.createWithUsage(auth, {
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: 5,
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: [run.dustRunId],
  });
  await ConversationResource.updateAgentMessageCostCredits(auth, {
    agentMessageModelId: agentMessage.agentMessageId,
    costCredits: BILLED_CREDITS,
  });
  await ConversationFactory.setAgentMessageStatus({
    workspace,
    agentMessageModelId: agentMessage.agentMessageId,
    status: "succeeded",
  });

  return { auth, workspace, conversation, agentMessage, runUsageModelId };
}

function getConsumption({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/consumption`
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/consumption", () => {
  it("returns the exact conversation bill while attribution is unavailable", async () => {
    const { workspace, conversation } = await setupConversation();

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      details: null,
    });
  });

  it("returns reconciled conversation, model, and agent totals", async () => {
    const { auth, workspace, conversation, agentMessage, runUsageModelId } =
      await setupConversation();
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: PREVIOUS_ATTRIBUTION_VERSION,
      records: [
        {
          itemType: "input",
          runUsageModelId,
          inputTokensCount: 100,
          grossAttributedCreditAmountMicro: 8_000_000,
        },
        {
          itemType: "output",
          runUsageModelId,
          outputTokensCount: 15,
          grossAttributedCreditAmountMicro: 1_000_000,
        },
        {
          itemType: "reasoning",
          runUsageModelId,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 1_000_000,
        },
      ],
      pendingToolItems: [],
    });

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      billedCredits: BILLED_CREDITS,
      details: {
        agentWorkCredits: BILLED_CREDITS,
        models: [{ attributedCredits: BILLED_CREDITS }],
        agents: [
          {
            billedCredits: BILLED_CREDITS,
            agentWorkCredits: BILLED_CREDITS,
          },
        ],
      },
    });
  });
});
