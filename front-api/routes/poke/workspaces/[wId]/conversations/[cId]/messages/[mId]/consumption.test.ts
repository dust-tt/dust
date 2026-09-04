import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const BILLED_CREDITS = 10;

async function setupMessage() {
  const { auth, user, workspace } = await createPrivateApiMockRequest({
    isSuperUser: true,
    role: "user",
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
  await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
    conversation,
    agentMessageModelId: agentMessage.agentMessageId,
    attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    records: [
      {
        itemType: "input",
        runUsageModelId,
        inputTokensCount: 100,
        grossAttributedCreditAmountMicro: 2_000_000,
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

  return { agentMessage, auth, conversation, user, workspace };
}

function messageConsumptionUrl({
  conversationId,
  messageId,
  workspaceId,
}: {
  conversationId: string;
  messageId: string;
  workspaceId: string;
}) {
  return `/api/poke/workspaces/${workspaceId}/conversations/${conversationId}/messages/${messageId}/consumption`;
}

describe("GET /api/poke/workspaces/:wId/conversations/:cId/messages/:mId/consumption", () => {
  it("returns the app message attribution plus model details to a Poke superuser", async () => {
    const { agentMessage, user, workspace, conversation } =
      await setupMessage();
    const revokeResult = await MembershipResource.revokeMembership({
      user,
      workspace,
    });
    if (revokeResult.isErr()) {
      throw revokeResult.error;
    }

    const response = await honoApp.request(
      messageConsumptionUrl({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: agentMessage.sId,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      billedCredits: BILLED_CREDITS,
      totalBilledCredits: BILLED_CREDITS,
      details: {
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        agentWorkCredits: BILLED_CREDITS,
        tools: [],
        models: [
          {
            attributedCredits: BILLED_CREDITS,
          },
        ],
      },
    });
  });

  it("returns not found for an unknown message", async () => {
    const { conversation, workspace } = await setupMessage();

    const response = await honoApp.request(
      messageConsumptionUrl({
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: "missing-message",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "message_not_found" },
    });
  });
});
