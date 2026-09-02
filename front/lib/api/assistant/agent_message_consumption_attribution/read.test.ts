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
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
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

  it.each([
    { hidden: false, description: "visible" },
    { hidden: true, description: "hidden helper" },
  ])("attributes a $description sub-agent subtree", async ({ hidden }) => {
    const {
      auth,
      workspace,
      conversation,
      run,
      runUsageModelId,
      agentMessage,
    } = await setupMessage();
    const childAgentId = hidden
      ? GLOBAL_AGENTS_SID.DUST_TASK
      : (
          await AgentConfigurationFactory.createTestAgent(auth, {
            name: "Research agent",
          })
        ).sId;
    const grandchildAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Web researcher",
      }
    );
    const childConversationData = await ConversationFactory.create(auth, {
      agentConfigurationId: childAgentId,
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
    const childAgentMessage =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: childConversationData.id,
        agentConfigurationId: childAgentId,
        parentId: childUserMessage.id,
        rank: 1,
      });
    if (!childAgentMessage.agentMessageId) {
      throw new Error("Child agent message was not created.");
    }
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: childAgentMessage.agentMessageId,
      costCredits: 20,
    });

    const grandchildConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: grandchildAgent.sId,
      messagesCreatedAt: [],
      depth: 2,
    });
    const { messageRow: grandchildUserMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: grandchildConversation,
        content: "Research further",
        agenticMessageType: "run_agent",
        agenticOriginMessageId: childAgentMessage.sId,
        authorless: true,
      });
    const { agentMessage: grandchildAgentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation: grandchildConversation,
        agentConfig: grandchildAgent,
        parentMessageModelId: grandchildUserMessage.id,
        rank: 1,
      });
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: grandchildAgentMessage.agentMessageId,
      costCredits: 3,
    });

    const runAgentServerId = internalMCPServerNameToSId({
      name: "run_agent",
      workspaceId: workspace.id,
      prefix: 1,
    });
    const { action: runChildAction } = await AgentMCPActionFactory.create(
      auth,
      {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        status: "succeeded",
        dustRunId: run.dustRunId,
        functionCallName: "run_research_agent",
        toolName: "run_research_agent",
        toolServerId: runAgentServerId,
      }
    );
    await runChildAction.updateStepContext({
      ...runChildAction.stepContext,
      resumeState: {
        conversationId: childConversation.sId,
        userMessageId: childUserMessage.sId,
      },
    });
    const { action: runGrandchildAction } = await AgentMCPActionFactory.create(
      auth,
      {
        workspace,
        conversationModelId: childConversation.id,
        agentMessageModelId: childAgentMessage.agentMessageId,
        status: "succeeded",
        dustRunId: run.dustRunId,
        functionCallName: "run_web_researcher",
        toolName: "run_web_researcher",
        toolServerId: runAgentServerId,
      }
    );
    await runGrandchildAction.updateStepContext({
      ...runGrandchildAction.stepContext,
      resumeState: {
        conversationId: grandchildConversation.sId,
        userMessageId: grandchildUserMessage.sId,
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
          action: runChildAction,
          inputTokensCount: 20,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 6_000_000,
          directCreditAmountMicro: 4_000_000,
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
      totalBilledCredits: 33,
      details: {
        agentWorkCredits: hidden ? 33 : 4,
        tools: hidden
          ? []
          : [
              expect.objectContaining({
                label: "Run Research agent",
                callCount: 1,
                attributedCredits: 29,
                directCredits: 4,
                toolName: "run_research_agent",
              }),
            ],
      },
    });
  });

  it("keeps visible pending tools when a hidden helper shares their tool identity", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      runUsageModelId,
      agentMessage,
    } = await setupMessage();
    const runAgentServerId = internalMCPServerNameToSId({
      name: "run_agent",
      workspaceId: workspace.id,
      prefix: 1,
    });
    const { action: hiddenHelperAction } = await AgentMCPActionFactory.create(
      auth,
      {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        dustRunId: run.dustRunId,
        functionCallName: "run_agent",
        toolName: "run_agent",
        toolServerId: runAgentServerId,
        childAgentId: GLOBAL_AGENTS_SID.DUST_TASK,
      }
    );
    const { action: visibleSubAgentAction } =
      await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        dustRunId: run.dustRunId,
        functionCallName: "run_agent",
        toolName: "run_agent",
        toolServerId: runAgentServerId,
        childAgentId: generateRandomModelSId(),
      });

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId: agentMessage.agentMessageId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: modelRecords(runUsageModelId),
      pendingToolItems: [
        {
          action: hiddenHelperAction,
          runUsageModelId,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 1_000_000,
        },
        {
          action: visibleSubAgentAction,
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

    expect(consumption?.details).toMatchObject({
      agentWorkCredits: 9,
      tools: [
        expect.objectContaining({
          attributedCredits: 1,
          callCount: 1,
          directCredits: 0,
          pending: true,
          toolName: "run_agent",
        }),
      ],
    });
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
      totalBilledCredits: BILLED_CREDITS,
      details: null,
    });
  });
});
