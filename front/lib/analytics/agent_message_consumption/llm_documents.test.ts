import { buildLlmConsumptionDocuments } from "@app/lib/analytics/agent_message_consumption/llm_documents";
import { loadAgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

describe("buildLlmConsumptionDocuments", () => {
  it("builds one additive document for a model run", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversationType = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const conversation = await ConversationResource.fetchById(
      auth,
      conversationType.sId
    );
    if (!conversation) {
      throw new Error("Conversation was not created");
    }

    const userMessage = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Hello",
    });
    const { run, runUsageModelId } = await RunFactory.createWithUsage(auth, {
      inputTokens: 100,
      outputTokens: 20,
      reasoningTokens: 5,
      modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
    });
    const agentMessage = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 1,
      parentId: userMessage.id,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      resolvedModel: {
        providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
        modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
        reasoningEffort: "none",
      },
      modelResolutionMethod: "agent",
    });
    const agentMessageModelId = agentMessage.agentMessageId;
    if (!agentMessageModelId) {
      throw new Error("Agent message was not created");
    }

    const completedAt = new Date("2026-08-05T12:00:00.000Z");
    await AgentMessageModel.update(
      {
        completedAt,
        costCredits: 5,
        runIds: [run.dustRunId],
        status: "succeeded",
      },
      { where: { id: agentMessageModelId, workspaceId: workspace.id } }
    );
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records: [
        {
          itemType: "system",
          runUsageModelId,
          inputTokensCount: 10,
          grossAttributedCreditAmountMicro: 500_000,
        },
        {
          itemType: "input",
          runUsageModelId,
          inputTokensCount: 90,
          grossAttributedCreditAmountMicro: 4_000_000,
        },
        {
          itemType: "output",
          runUsageModelId,
          outputTokensCount: 15,
          grossAttributedCreditAmountMicro: 300_000,
        },
        {
          itemType: "reasoning",
          runUsageModelId,
          outputTokensCount: 5,
          grossAttributedCreditAmountMicro: 200_000,
        },
      ],
      pendingToolItems: [],
    });

    const input = await loadAgentMessageConsumptionAnalyticsInput(auth, {
      agentMessageId: agentMessage.sId,
    });
    if (!input) {
      throw new Error("Consumption analytics input was not loaded");
    }
    const allocation = buildLatestMessageConsumptionAllocation({
      actions: input.actions,
      billedCredits: input.billedCredits,
      dustRunIds: input.dustRunIds,
      items: input.items,
      runs: input.runs,
      usages: input.usages,
    });
    if (!allocation) {
      throw new Error("Consumption allocation was not built");
    }

    expect(buildLlmConsumptionDocuments(input, allocation)).toEqual([
      expect.objectContaining({
        agent_message_id: agentMessage.sId,
        completed_at: completedAt.toISOString(),
        created_at: agentMessage.createdAt.toISOString(),
        consumption_key: `run-usage:${runUsageModelId}`,
        consumption_type: "llm",
        credit_micro: 5_000_000,
        gross_credit_micro: {
          system: 500_000,
          input: 4_000_000,
          result_footprint: null,
          output: 300_000,
          reasoning: 200_000,
          direct: 0,
          total: 5_000_000,
        },
        run_usage_id: runUsageModelId.toString(),
        step_index: 0,
        tokens: {
          system: 10,
          input: 90,
          result_footprint: null,
          output: 15,
          reasoning: 5,
        },
        tool: null,
        user: {
          id: auth.getNonNullableUser().sId,
          group_ids: [],
        },
      }),
    ]);
  });
});
