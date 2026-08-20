import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { getAgentMessageConsumption } from "@app/lib/api/assistant/agent_message_consumption_attribution/read";
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
const INPUT_GROSS_CREDITS_MICRO = 2_000_000;
const OUTPUT_GROSS_CREDITS_MICRO = 1_000_000;
const REASONING_GROSS_CREDITS_MICRO = 1_000_000;

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
    agentConfiguration,
  };
}

function modelRecords(runUsageModelId: ModelId) {
  return [
    {
      itemType: "input" as const,
      runUsageModelId,
      inputTokensCount: 100,
      grossAttributedCreditAmountMicro: INPUT_GROSS_CREDITS_MICRO,
    },
    {
      itemType: "output" as const,
      runUsageModelId,
      outputTokensCount: 15,
      grossAttributedCreditAmountMicro: OUTPUT_GROSS_CREDITS_MICRO,
    },
    {
      itemType: "reasoning" as const,
      runUsageModelId,
      outputTokensCount: 5,
      grossAttributedCreditAmountMicro: REASONING_GROSS_CREDITS_MICRO,
    },
  ];
}

describe("getAgentMessageConsumption", () => {
  it("groups repeated tools and reconciles the breakdown to the exact bill", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      runUsageModelId,
      agentMessage,
    } = await setupMessage();
    const { action: firstAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      dustRunId: run.dustRunId,
      step: 1,
    });
    const { action: secondAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      dustRunId: run.dustRunId,
      step: 2,
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
          action: firstAction,
          inputTokensCount: 20,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 4_000_000,
          directCreditAmountMicro: 3_000_000,
        },
        {
          itemType: "tool",
          runUsageModelId,
          action: secondAction,
          inputTokensCount: 10,
          outputTokensCount: 4,
          grossAttributedCreditAmountMicro: 3_000_000,
          directCreditAmountMicro: 1_000_000,
        },
      ],
      pendingToolItems: [],
    });

    const consumption = await getAgentMessageConsumption(auth, {
      conversation,
      agentMessageId: agentMessage.sId,
    });

    expect(consumption).toEqual({
      billedCredits: BILLED_CREDITS,
      subAgentBilledCredits: 0,
      totalBilledCredits: BILLED_CREDITS,
      details: {
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        agentWorkCredits: 3,
        tools: [
          expect.objectContaining({
            label: "Test tool",
            callCount: 2,
            attributedCredits: 7,
            directCredits: 4,
            pending: false,
            toolName: "test_tool",
          }),
        ],
      },
    });
  });

  it("attributes direct sub-agent tools without expanding deeper descendants", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      runUsageModelId,
      agentMessage,
      agentConfiguration,
    } = await setupMessage();
    const childConversationData = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
      depth: 1,
    });
    const childConversation = await ConversationResource.fetchById(
      auth,
      childConversationData.sId
    );
    if (!childConversation) {
      throw new Error("Just-created child conversation not found.");
    }
    const { run: childRun, runUsageModelId: childRunUsageModelId } =
      await RunFactory.createWithUsage(auth, {
        inputTokens: 100,
        outputTokens: 20,
        reasoningTokens: 5,
      });
    const { messageRow: childUserMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: childConversationData,
        content: "Research this",
        agenticMessageType: "run_agent",
        agenticOriginMessageId: agentMessage.sId,
        authorless: true,
      });
    const { agentMessage: childAgentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation: childConversationData,
        agentConfig: agentConfiguration,
        parentMessageModelId: childUserMessage.id,
        rank: 1,
        runIds: [childRun.dustRunId],
      });
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: childAgentMessage.agentMessageId,
      costCredits: 20,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: childAgentMessage.agentMessageId,
      status: "succeeded",
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
        functionCallName: "run_dust-task",
        toolName: "run_dust-task",
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
    const { action: websearchAction } = await AgentMCPActionFactory.create(
      auth,
      {
        workspace,
        conversationModelId: childConversation.id,
        agentMessageModelId: childAgentMessage.agentMessageId,
        status: "succeeded",
        dustRunId: childRun.dustRunId,
        functionCallName: "websearch",
        toolName: "websearch",
        mcpServerName: "web_search_&_browse",
      }
    );
    const grandChildConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
      depth: 2,
    });
    const { messageRow: grandChildUserMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: grandChildConversation,
        content: "Research this further",
        agenticMessageType: "run_agent",
        agenticOriginMessageId: childAgentMessage.sId,
        authorless: true,
      });
    const { agentMessage: grandChildAgentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation: grandChildConversation,
        agentConfig: agentConfiguration,
        parentMessageModelId: grandChildUserMessage.id,
        rank: 1,
      });
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: grandChildAgentMessage.agentMessageId,
      costCredits: 3,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: grandChildAgentMessage.agentMessageId,
      status: "succeeded",
    });
    const { action: nestedRunAgentAction } = await AgentMCPActionFactory.create(
      auth,
      {
        workspace,
        conversationModelId: childConversation.id,
        agentMessageModelId: childAgentMessage.agentMessageId,
        status: "succeeded",
        dustRunId: childRun.dustRunId,
        step: 2,
        functionCallName: "run_dust-task",
        toolName: "run_dust-task",
        toolServerId: runAgentServerId,
      }
    );
    await nestedRunAgentAction.updateStepContext({
      ...nestedRunAgentAction.stepContext,
      resumeState: {
        conversationId: grandChildConversation.sId,
        userMessageId: grandChildUserMessage.sId,
      },
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
          action: runAgentAction,
          inputTokensCount: 20,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 6_000_000,
          directCreditAmountMicro: 4_000_000,
        },
      ],
      pendingToolItems: [],
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: childConversation,
      agentMessageModelId: childAgentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: [
        ...modelRecords(childRunUsageModelId),
        {
          itemType: "tool",
          runUsageModelId: childRunUsageModelId,
          action: websearchAction,
          inputTokensCount: 50,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 13_000_000,
          directCreditAmountMicro: 12_000_000,
        },
        {
          itemType: "tool",
          runUsageModelId: childRunUsageModelId,
          action: nestedRunAgentAction,
          inputTokensCount: 20,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 3_000_000,
          directCreditAmountMicro: 2_000_000,
        },
      ],
      pendingToolItems: [],
    });

    const consumption = await getAgentMessageConsumption(auth, {
      conversation,
      agentMessageId: agentMessage.sId,
    });

    expect(consumption).toMatchObject({
      billedCredits: BILLED_CREDITS,
      subAgentBilledCredits: 23,
      totalBilledCredits: BILLED_CREDITS + 23,
      details: {
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        agentWorkCredits: 11,
        tools: [
          expect.objectContaining({
            toolName: "websearch",
            callCount: 1,
            attributedCredits: 13,
          }),
          expect.objectContaining({
            toolName: "run_dust-task",
            callCount: 2,
            attributedCredits: 9,
          }),
        ],
      },
    });
  });

  it("exposes a blocked tool as pending without inventing a direct charge", async () => {
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
      dustRunId: run.dustRunId,
    });

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId),
      pendingToolItems: [
        {
          action,
          runUsageModelId,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 1_000_000,
        },
      ],
    });

    const consumption = await getAgentMessageConsumption(auth, {
      conversation,
      agentMessageId: agentMessage.sId,
    });

    expect(consumption?.details?.tools).toEqual([
      expect.objectContaining({
        callCount: 1,
        directCredits: 0,
        pending: true,
      }),
    ]);
  });

  it("assigns an unattributed billed residual to agent work", async () => {
    const { auth, conversation, runUsageModelId, agentMessage } =
      await setupMessage();

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId),
      pendingToolItems: [],
    });

    const consumption = await getAgentMessageConsumption(auth, {
      conversation,
      agentMessageId: agentMessage.sId,
    });

    expect(consumption?.details).toMatchObject({
      agentWorkCredits: BILLED_CREDITS,
      tools: [],
    });
  });

  it("withholds details when non-input attribution exceeds the bill", async () => {
    const { auth, conversation, runUsageModelId, agentMessage } =
      await setupMessage();

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId).map((record) =>
        record.itemType === "output"
          ? {
              ...record,
              grossAttributedCreditAmountMicro: 10_000_000,
            }
          : record
      ),
      pendingToolItems: [],
    });

    await expect(
      getAgentMessageConsumption(auth, {
        conversation,
        agentMessageId: agentMessage.sId,
      })
    ).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      subAgentBilledCredits: 0,
      totalBilledCredits: BILLED_CREDITS,
      details: null,
    });
  });

  it("falls back to the newest complete previous attribution", async () => {
    const { auth, conversation, runUsageModelId, agentMessage } =
      await setupMessage();

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: PREVIOUS_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId),
      pendingToolItems: [],
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId).filter(
        (record) => record.itemType !== "output"
      ),
      pendingToolItems: [],
    });

    const consumption = await getAgentMessageConsumption(auth, {
      conversation,
      agentMessageId: agentMessage.sId,
    });

    expect(consumption?.details).toMatchObject({
      attributionVersion: PREVIOUS_ATTRIBUTION_VERSION,
      agentWorkCredits: BILLED_CREDITS,
      tools: [],
    });
  });

  it("withholds details when no version covers every current run bucket", async () => {
    const { auth, conversation, runUsageModelId, agentMessage } =
      await setupMessage();

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId).filter(
        (record) => record.itemType !== "output"
      ),
      pendingToolItems: [],
    });

    await expect(
      getAgentMessageConsumption(auth, {
        conversation,
        agentMessageId: agentMessage.sId,
      })
    ).resolves.toEqual({
      billedCredits: BILLED_CREDITS,
      subAgentBilledCredits: 0,
      totalBilledCredits: BILLED_CREDITS,
      details: null,
    });
  });
});
