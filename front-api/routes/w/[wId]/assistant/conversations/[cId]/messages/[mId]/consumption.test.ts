import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

const BILLED_CREDITS = 20;
const SUB_AGENT_BILLED_CREDITS = 282;
const PREVIOUS_ATTRIBUTION_VERSION =
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION - 1;

async function setupMessage() {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "user",
    method: "GET",
  });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: "Consumption endpoint" }
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

  return {
    auth,
    workspace,
    conversation,
    agentConfiguration,
    agentMessage,
    run,
    runUsageModelId,
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
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/consumption`
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/messages/:mId/consumption", () => {
  it("returns the exact bill while attribution is unavailable", async () => {
    const { auth, workspace, conversation, agentMessage } =
      await setupMessage();
    await FeatureFlagFactory.basic(auth, "conversation_consumption_details");

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

  it("includes credits billed by direct sub-agents", async () => {
    const {
      auth,
      workspace,
      conversation,
      agentConfiguration,
      agentMessage,
      run,
    } = await setupMessage();
    await FeatureFlagFactory.basic(auth, "conversation_consumption_details");

    const childConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: childUserMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: childConversation,
        content: "Run a sub-agent",
        agenticMessageType: "run_agent",
        agenticOriginMessageId: agentMessage.sId,
      });
    const { agentMessage: childAgentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation: childConversation,
        agentConfig: agentConfiguration,
        parentMessageModelId: childUserMessage.id,
        rank: 1,
      });
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: childAgentMessage.agentMessageId,
      costCredits: SUB_AGENT_BILLED_CREDITS,
    });
    const runAgentServerId = internalMCPServerNameToSId({
      name: "run_agent",
      workspaceId: workspace.id,
      prefix: 1,
    });
    const { action: runAgentAction } = await AgentMCPActionFactory.create(
      auth,
      {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        status: "succeeded",
        dustRunId: run.dustRunId,
        functionCallName: "run_consumption_agent",
        toolName: "run_consumption_agent",
        toolServerId: runAgentServerId,
      }
    );
    await runAgentAction.updateStepContext({
      ...runAgentAction.stepContext,
      resumeState: {
        conversationId: childConversation.sId,
        userMessageId: childUserMessage.sId,
      },
    });

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      totalBilledCredits: BILLED_CREDITS + SUB_AGENT_BILLED_CREDITS,
      details: null,
    });
  });

  it("returns a breakdown reconciled exclusively through model input", async () => {
    const { auth, workspace, conversation, agentMessage, runUsageModelId } =
      await setupMessage();
    await FeatureFlagFactory.basic(auth, "conversation_consumption_details");
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
      messageId: agentMessage.sId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      billedCredits: BILLED_CREDITS,
      details: {
        attributionVersion: PREVIOUS_ATTRIBUTION_VERSION,
        agentWorkCredits: BILLED_CREDITS,
      },
    });
  });

  it("rejects workspaces without the feature flag", async () => {
    const { workspace, conversation, agentMessage } = await setupMessage();

    const response = await getConsumption({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
    });

    expect(response.status).toBe(403);
  });
});
