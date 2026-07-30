import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { RunUsageModel } from "@app/lib/resources/storage/models/runs";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

async function setupMessageWithEvidence(
  auth: Authenticator,
  workspace: LightWorkspaceType
) {
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: `Consumption ${generateRandomModelSId()}` }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
  });
  const dustRunId = generateRandomModelSId();
  const run = await RunResource.makeNew({
    appId: null,
    dustRunId,
    runType: "deploy",
    useWorkspaceCredentials: false,
    workspaceId: workspace.id,
  });
  const runUsage = await RunUsageModel.create({
    workspaceId: workspace.id,
    runId: run.id,
    providerId: "openai",
    modelId: "gpt-5-mini",
    promptTokens: 100,
    completionTokens: 20,
    reasoningTokens: null,
    cachedTokens: null,
    cacheCreationTokens: null,
    costMicroUsd: 10,
    isBatch: false,
  });
  await AgentMessageModel.update(
    { runIds: [dustRunId] },
    { where: { id: agentMessage.agentMessageId, workspaceId: workspace.id } }
  );
  const { action } = await AgentMCPActionFactory.create(auth, {
    workspace,
    conversationModelId: conversation.id,
    agentMessageModelId: agentMessage.agentMessageId,
  });
  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    throw new Error("Conversation not found");
  }

  return {
    conversation: conversationResource,
    agentMessageModelId: agentMessage.agentMessageId,
    runUsageModelId: runUsage.id,
    action,
  };
}

describe("AgentMessageConsumptionItemResource", () => {
  it("keeps pending state exclusive to incomplete tools", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    const pendingInput = AgentMessageConsumptionItemModel.build({
      workspaceId: workspace.id,
      conversationId: context.conversation.id,
      agentMessageId: context.agentMessageModelId,
      runUsageId: context.runUsageModelId,
      agentMCPActionId: null,
      itemKey: `run-usage:${context.runUsageModelId}:input`,
      itemType: "input",
      attributionVersion: 1,
      inputTokensCount: 100,
      outputTokensCount: null,
      grossAttributedCreditAmountMicro: 300_000,
      directCreditAmountMicro: null,
      completedAt: null,
    });
    await expect(pendingInput.validate()).rejects.toThrow(
      "Only tool attribution items may be pending"
    );

    const pendingToolWithResult = AgentMessageConsumptionItemModel.build({
      workspaceId: workspace.id,
      conversationId: context.conversation.id,
      agentMessageId: context.agentMessageModelId,
      runUsageId: context.runUsageModelId,
      agentMCPActionId: context.action.id,
      itemKey: `tool-action:${context.action.id}`,
      itemType: "tool",
      attributionVersion: 1,
      inputTokensCount: 40,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 300_000,
      directCreditAmountMicro: null,
      completedAt: null,
    });
    await expect(pendingToolWithResult.validate()).rejects.toThrow(
      "Pending tool attribution items cannot contain result or direct credit evidence"
    );
  });

  it("keeps the first completed facts when insertion is retried", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    const records = [
      {
        itemType: "input" as const,
        runUsageModelId: context.runUsageModelId,
        inputTokensCount: 100,
        grossAttributedCreditAmountMicro: 300_000,
      },
      {
        itemType: "tool" as const,
        runUsageModelId: context.runUsageModelId,
        action: context.action,
        inputTokensCount: 40,
        outputTokensCount: 12,
        grossAttributedCreditAmountMicro: 2_000_000,
        directCreditAmountMicro: 1_000_000,
      },
    ];

    await AgentMessageConsumptionItemResource.insertCompletedItemsIdempotently(
      auth,
      {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: 1,
        records,
      }
    );
    await AgentMessageConsumptionItemResource.insertCompletedItemsIdempotently(
      auth,
      {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: 1,
        records: [
          { ...records[0], inputTokensCount: 101 },
          { ...records[1], inputTokensCount: 41 },
        ],
      }
    );

    const items = await listItems(auth, context.agentMessageModelId);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemKey: `run-usage:${context.runUsageModelId}:input`,
          inputTokensCount: 100,
        }),
        expect.objectContaining({
          itemKey: `tool-action:${context.action.id}`,
          inputTokensCount: 40,
        }),
      ])
    );
    expect(items).toHaveLength(2);
  });

  it("enriches a pending tool once without changing its provenance", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    await AgentMessageConsumptionItemResource.insertPendingToolItemIdempotently(
      auth,
      {
        conversation: context.conversation,
        attributionVersion: 1,
        item: {
          action: context.action,
          runUsageModelId: context.runUsageModelId,
          outputTokensCount: 12,
          grossAttributedCreditAmountMicro: 400_000,
        },
      }
    );
    const completion = {
      action: context.action,
      inputTokensCount: 40,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
    };

    await AgentMessageConsumptionItemResource.completePendingToolItemIdempotently(
      auth,
      { attributionVersion: 1, item: completion }
    );
    await AgentMessageConsumptionItemResource.completePendingToolItemIdempotently(
      auth,
      {
        attributionVersion: 1,
        item: { ...completion, inputTokensCount: 41 },
      }
    );

    await expect(listItems(auth, context.agentMessageModelId)).resolves.toEqual(
      [
        expect.objectContaining({
          runUsageId: context.runUsageModelId,
          inputTokensCount: 40,
          outputTokensCount: 12,
          grossAttributedCreditAmountMicro: 2_000_000,
          directCreditAmountMicro: 1_000_000,
          completedAt: expect.any(Date),
        }),
      ]
    );
  });

  it("deletes facts only for the requested owning messages", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const first = await setupMessageWithEvidence(auth, workspace);
    const second = await setupMessageWithEvidence(auth, workspace);
    await createPendingTool(auth, first);
    await createPendingTool(auth, second);

    await AgentMessageConsumptionItemResource.deleteByAgentMessageModelIds(
      auth,
      { agentMessageModelIds: [first.agentMessageModelId] }
    );

    await expect(
      listItems(auth, first.agentMessageModelId)
    ).resolves.toHaveLength(0);
    await expect(
      listItems(auth, second.agentMessageModelId)
    ).resolves.toHaveLength(1);
  });
});

async function listItems(auth: Authenticator, agentMessageModelId: ModelId) {
  return AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
    agentMessageModelIds: [agentMessageModelId],
    attributionVersion: 1,
  });
}

async function createPendingTool(
  auth: Authenticator,
  context: {
    conversation: ConversationResource;
    action: AgentMCPActionResource;
    runUsageModelId: ModelId;
  }
) {
  await AgentMessageConsumptionItemResource.insertPendingToolItemIdempotently(
    auth,
    {
      conversation: context.conversation,
      attributionVersion: 1,
      item: {
        action: context.action,
        runUsageModelId: context.runUsageModelId,
        outputTokensCount: 12,
        grossAttributedCreditAmountMicro: 400_000,
      },
    }
  );
}
