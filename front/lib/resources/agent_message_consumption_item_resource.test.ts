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
  it("rejects pending non-tool items", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    const item = AgentMessageConsumptionItemModel.build({
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

    await expect(item.validate()).rejects.toThrow(
      "Only tool attribution items may be pending"
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

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          attributionVersion: 1,
        }
      );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemKey: `run-usage:${context.runUsageModelId}:input`,
          inputTokensCount: 100,
        }),
        expect.objectContaining({
          itemKey: `tool-action:${context.action.id}`,
          inputTokensCount: 40,
          outputTokensCount: 12,
          directCreditAmountMicro: 1_000_000,
        }),
      ])
    );
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.completedAt !== null)).toBe(true);
  });

  it("completes an approval-spanning tool once", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    await AgentMessageConsumptionItemResource.insertPendingToolItemIdempotently(
      auth,
      {
        conversation: context.conversation,
        attributionVersion: 1,
        item: {
          action: context.action,
          runUsageModelId: null,
          outputTokensCount: 12,
          grossAttributedCreditAmountMicro: 400_000,
        },
      }
    );

    const completedItem = {
      action: context.action,
      runUsageModelId: context.runUsageModelId,
      inputTokensCount: 40,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
    };
    await AgentMessageConsumptionItemResource.completePendingToolItemIdempotently(
      auth,
      {
        attributionVersion: 1,
        item: completedItem,
      }
    );
    await AgentMessageConsumptionItemResource.completePendingToolItemIdempotently(
      auth,
      {
        attributionVersion: 1,
        item: { ...completedItem, inputTokensCount: 41 },
      }
    );
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

    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [context.agentMessageModelId],
        attributionVersion: 1,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        itemKey: `tool-action:${context.action.id}`,
        runUsageId: context.runUsageModelId,
        inputTokensCount: 40,
        outputTokensCount: 12,
        grossAttributedCreditAmountMicro: 2_000_000,
        directCreditAmountMicro: 1_000_000,
        completedAt: expect.any(Date),
      }),
    ]);
  });

  it("does not create a tool fact when no pending fact exists", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    await AgentMessageConsumptionItemResource.completePendingToolItemIdempotently(
      auth,
      {
        attributionVersion: 1,
        item: {
          action: context.action,
          runUsageModelId: context.runUsageModelId,
          inputTokensCount: 40,
          outputTokensCount: 12,
          grossAttributedCreditAmountMicro: 2_000_000,
          directCreditAmountMicro: 1_000_000,
        },
      }
    );

    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [context.agentMessageModelId],
        attributionVersion: 1,
      })
    ).resolves.toHaveLength(0);
  });

  it("deletes facts only for the requested owning messages", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const first = await setupMessageWithEvidence(auth, workspace);
    const second = await setupMessageWithEvidence(auth, workspace);

    async function createToolFact(context: {
      conversation: ConversationResource;
      agentMessageModelId: ModelId;
      runUsageModelId: ModelId;
      action: AgentMCPActionResource;
    }) {
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
    await createToolFact(first);
    await createToolFact(second);

    await AgentMessageConsumptionItemResource.deleteByAgentMessageModelIds(
      auth,
      { agentMessageModelIds: [first.agentMessageModelId] }
    );

    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [first.agentMessageModelId],
        attributionVersion: 1,
      })
    ).resolves.toHaveLength(0);
    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [second.agentMessageModelId],
        attributionVersion: 1,
      })
    ).resolves.toHaveLength(1);
  });
});
