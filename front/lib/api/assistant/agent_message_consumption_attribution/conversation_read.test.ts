import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { getConversationConsumption } from "@app/lib/api/assistant/agent_message_consumption_attribution/conversation_read";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

const BILLED_CREDITS = 10;

async function setupMessage() {
  const { authenticator: auth, workspace } = await createResourceTest({});
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: `Consumption ${generateRandomModelSId()}` }
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
    run,
    runUsageModelId,
    agentMessage,
  };
}

function modelRecords(runUsageModelId: ModelId) {
  return [
    {
      itemType: "input" as const,
      runUsageModelId,
      inputTokensCount: 100,
      grossAttributedCreditAmountMicro: 2_000_000,
    },
    {
      itemType: "output" as const,
      runUsageModelId,
      outputTokensCount: 15,
      grossAttributedCreditAmountMicro: 1_000_000,
    },
    {
      itemType: "reasoning" as const,
      runUsageModelId,
      outputTokensCount: 5,
      grossAttributedCreditAmountMicro: 1_000_000,
    },
  ];
}

describe("getConversationConsumption", () => {
  it("aggregates the exact bill and active attribution by tool, model, and agent", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      runUsageModelId,
      agentMessage,
    } = await setupMessage();
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      dustRunId: run.dustRunId,
      step: 1,
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: [
        ...modelRecords(runUsageModelId),
        {
          itemType: "tool",
          runUsageModelId,
          action,
          inputTokensCount: 20,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 5_000_000,
          directCreditAmountMicro: 3_000_000,
        },
      ],
      pendingToolItems: [],
    });

    const consumption = await getConversationConsumption(auth, {
      conversation,
    });

    expect(consumption).toMatchObject({
      billedCredits: BILLED_CREDITS,
      details: {
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        agentWorkCredits: 5,
        tools: [
          {
            label: "Test Tool",
            callCount: 1,
            attributedCredits: 5,
            directCredits: 3,
            pending: false,
            toolName: "test_tool",
          },
        ],
        models: [
          {
            displayName: "GPT-5 Mini",
            attributedCredits: BILLED_CREDITS,
            modelId: "gpt-5-mini",
            providerId: "openai",
          },
        ],
        agents: [
          expect.objectContaining({
            billedCredits: BILLED_CREDITS,
            agentWorkCredits: 5,
          }),
        ],
      },
    });
  });

  it("omits free tools from conversation and agent breakdowns", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      runUsageModelId,
      agentMessage,
    } = await setupMessage();
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      dustRunId: run.dustRunId,
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: [
        ...modelRecords(runUsageModelId),
        {
          itemType: "tool",
          runUsageModelId,
          action,
          inputTokensCount: 0,
          outputTokensCount: 0,
          grossAttributedCreditAmountMicro: 0,
          directCreditAmountMicro: 0,
        },
      ],
      pendingToolItems: [],
    });

    const consumption = await getConversationConsumption(auth, {
      conversation,
    });

    expect(consumption.details?.tools).toEqual([]);
    expect(consumption.details?.agents[0]?.tools).toEqual([]);
  });

  it("includes recursively spawned run-agent messages in the exact total", async () => {
    const { auth, workspace, conversation, agentMessage } =
      await setupMessage();
    const childAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: `Child ${generateRandomModelSId()}`,
    });
    const childConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: childAgent.sId,
      messagesCreatedAt: [],
      depth: 1,
    });
    const { messageRow: childUserMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: childConversation,
        content: "Delegated work",
        agenticMessageType: "run_agent",
        agenticOriginMessageId: agentMessage.sId,
        authorless: true,
      });
    const childAgentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: childConversation.id,
        rank: 1,
        agentConfigurationId: childAgent.sId,
        parentId: childUserMessage.id,
      });
    if (!childAgentMessageRow.agentMessageId) {
      throw new Error("Child agent message was not created.");
    }
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: childAgentMessageRow.agentMessageId,
      costCredits: 7,
    });

    await expect(
      getConversationConsumption(auth, { conversation })
    ).resolves.toEqual({
      billedCredits: BILLED_CREDITS + 7,
      details: null,
    });
  });
});
