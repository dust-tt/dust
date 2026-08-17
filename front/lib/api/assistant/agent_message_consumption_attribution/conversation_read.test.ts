import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
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
const PREVIOUS_ATTRIBUTION_VERSION =
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION - 1;

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
  await ConversationFactory.setAgentMessageStatus({
    workspace,
    agentMessageModelId: agentMessage.agentMessageId,
    status: "succeeded",
  });

  return {
    auth,
    workspace,
    conversation,
    run,
    runUsageModelId,
    agentMessage,
    agentConfiguration,
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

  it("aggregates messages using their newest complete attribution", async () => {
    const {
      auth,
      workspace,
      conversation,
      runUsageModelId,
      agentMessage,
      agentConfiguration,
    } = await setupMessage();
    const { run: previousRun, runUsageModelId: previousRunUsageModelId } =
      await RunFactory.createWithUsage(auth, {
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: 5,
      });
    const previousMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfiguration.sId,
        runIds: [previousRun.dustRunId],
      });
    if (!previousMessage.agentMessageId) {
      throw new Error("Previous-version agent message was not created.");
    }
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: previousMessage.agentMessageId,
      costCredits: BILLED_CREDITS,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: previousMessage.agentMessageId,
      status: "succeeded",
    });

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId),
      pendingToolItems: [],
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: previousMessage.agentMessageId,
      attributionVersion: PREVIOUS_ATTRIBUTION_VERSION,
      records: modelRecords(previousRunUsageModelId),
      pendingToolItems: [],
    });

    const consumption = await getConversationConsumption(auth, {
      conversation,
    });

    expect(consumption).toMatchObject({
      billedCredits: BILLED_CREDITS * 2,
      details: {
        agentWorkCredits: BILLED_CREDITS * 2,
        agents: [
          expect.objectContaining({
            billedCredits: BILLED_CREDITS * 2,
            agentWorkCredits: BILLED_CREDITS * 2,
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

  it("ignores in-progress messages until they reach a terminal state", async () => {
    const {
      auth,
      workspace,
      conversation,
      runUsageModelId,
      agentMessage,
      agentConfiguration,
    } = await setupMessage();
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId),
      pendingToolItems: [],
    });

    const inProgressMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfiguration.sId,
      });
    if (!inProgressMessage.agentMessageId) {
      throw new Error("In-progress agent message was not created.");
    }
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: inProgressMessage.agentMessageId,
      costCredits: 7,
    });

    await expect(
      getConversationConsumption(auth, { conversation })
    ).resolves.toMatchObject({
      billedCredits: BILLED_CREDITS,
      details: {
        agentWorkCredits: BILLED_CREDITS,
      },
    });
  });

  it("includes billed superseded message versions", async () => {
    const { auth, workspace, conversation, agentMessage, agentConfiguration } =
      await setupMessage();
    const retryMessage = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: agentMessage.rank,
      version: agentMessage.version + 1,
      agentConfigurationId: agentConfiguration.sId,
    });
    if (!retryMessage.agentMessageId) {
      throw new Error("Retry agent message was not created.");
    }
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: retryMessage.agentMessageId,
      costCredits: 7,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: retryMessage.agentMessageId,
      status: "succeeded",
    });

    await expect(
      getConversationConsumption(auth, { conversation })
    ).resolves.toEqual({
      billedCredits: BILLED_CREDITS + 7,
      details: null,
    });
  });

  it("includes direct and nested run-agent messages from child conversations", async () => {
    const { auth, workspace, conversation, agentMessage, runUsageModelId } =
      await setupMessage();
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId),
      pendingToolItems: [],
    });

    const childAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: `Child ${generateRandomModelSId()}`,
    });
    const grandChildAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: `Grandchild ${generateRandomModelSId()}` }
    );
    const runAgentServerId = internalMCPServerNameToSId({
      name: "run_agent",
      workspaceId: workspace.id,
      prefix: 1,
    });

    async function createAttributedSubAgent({
      agentConfigurationId,
      originMessageId,
      parentAgentMessageModelId,
      parentConversationModelId,
      costCredits,
      depth,
    }: {
      agentConfigurationId: string;
      originMessageId: string;
      parentAgentMessageModelId: ModelId;
      parentConversationModelId: ModelId;
      costCredits: number;
      depth: number;
    }): Promise<{
      agentMessageModelId: ModelId;
      conversationModelId: ModelId;
      messageId: string;
    }> {
      const createdConversation = await ConversationFactory.create(auth, {
        agentConfigurationId,
        messagesCreatedAt: [],
        depth,
      });
      const childConversation = await ConversationResource.fetchById(
        auth,
        createdConversation.sId
      );
      if (!childConversation) {
        throw new Error("Just-created child conversation not found.");
      }
      const { run, runUsageModelId: childRunUsageModelId } =
        await RunFactory.createWithUsage(auth, {
          inputTokens: 100,
          outputTokens: 20,
          reasoningTokens: 5,
        });
      const { messageRow: childUserMessage } =
        await ConversationFactory.createUserMessage({
          auth,
          workspace,
          conversation: createdConversation,
          content: "Delegated work",
          agenticMessageType: "run_agent",
          agenticOriginMessageId: originMessageId,
          authorless: true,
        });
      const childAgentMessageRow =
        await ConversationFactory.createAgentMessageWithRank({
          workspace,
          conversationId: createdConversation.id,
          rank: 1,
          agentConfigurationId,
          parentId: childUserMessage.id,
          runIds: [run.dustRunId],
        });
      if (!childAgentMessageRow.agentMessageId) {
        throw new Error("Child agent message was not created.");
      }
      await ConversationResource.updateAgentMessageCostCredits(auth, {
        agentMessageModelId: childAgentMessageRow.agentMessageId,
        costCredits,
      });
      await ConversationFactory.setAgentMessageStatus({
        workspace,
        agentMessageModelId: childAgentMessageRow.agentMessageId,
        status: "succeeded",
      });
      await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
        conversation: childConversation,
        agentMessageModelId: childAgentMessageRow.agentMessageId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        records: modelRecords(childRunUsageModelId),
        pendingToolItems: [],
      });

      const { action: runAgentAction } = await AgentMCPActionFactory.create(
        auth,
        {
          workspace,
          conversationModelId: parentConversationModelId,
          agentMessageModelId: parentAgentMessageModelId,
          status: "succeeded",
          toolServerId: runAgentServerId,
        }
      );
      await runAgentAction.updateStepContext({
        ...runAgentAction.stepContext,
        resumeState: {
          conversationId: createdConversation.sId,
          userMessageId: childUserMessage.sId,
        },
      });

      return {
        agentMessageModelId: childAgentMessageRow.agentMessageId,
        conversationModelId: createdConversation.id,
        messageId: childAgentMessageRow.sId,
      };
    }

    const child = await createAttributedSubAgent({
      agentConfigurationId: childAgent.sId,
      originMessageId: agentMessage.sId,
      parentAgentMessageModelId: agentMessage.agentMessageId,
      parentConversationModelId: conversation.id,
      costCredits: 7,
      depth: 1,
    });
    await createAttributedSubAgent({
      agentConfigurationId: grandChildAgent.sId,
      originMessageId: child.messageId,
      parentAgentMessageModelId: child.agentMessageModelId,
      parentConversationModelId: child.conversationModelId,
      costCredits: 3,
      depth: 2,
    });

    await expect(
      getConversationConsumption(auth, { conversation })
    ).resolves.toMatchObject({
      billedCredits: BILLED_CREDITS + 7 + 3,
      details: {
        agentWorkCredits: BILLED_CREDITS + 7 + 3,
        agents: expect.arrayContaining([
          expect.objectContaining({ billedCredits: BILLED_CREDITS }),
          expect.objectContaining({ billedCredits: 7 }),
          expect.objectContaining({ billedCredits: 3 }),
        ]),
      },
    });
  });
});
