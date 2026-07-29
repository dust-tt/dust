import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
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

  return {
    conversationModelId: conversation.id,
    agentMessageModelId: agentMessage.agentMessageId,
    runUsageModelId: runUsage.id,
    action,
  };
}

describe("AgentMessageConsumptionItemResource", () => {
  it("keeps the first completed facts when insertion is retried", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    const records = [
      {
        itemType: "input" as const,
        runUsageModelId: context.runUsageModelId,
        inputTokensCount: 100,
        grossAttributedCreditAmountMicro: 300_000,
        state: "completed" as const,
      },
      {
        itemType: "tool" as const,
        runUsageModelId: context.runUsageModelId,
        agentMCPActionModelId: context.action.id,
        inputTokensCount: 40,
        outputTokensCount: 12,
        grossAttributedCreditAmountMicro: 2_000_000,
        directCreditAmountMicro: 1_000_000,
        state: "completed" as const,
      },
    ];

    await AgentMessageConsumptionItemResource.insertItemsIdempotently(auth, {
      ...context,
      attributionVersion: 1,
      records,
    });
    await AgentMessageConsumptionItemResource.insertItemsIdempotently(auth, {
      ...context,
      attributionVersion: 1,
      records: [
        { ...records[0], inputTokensCount: 101 },
        { ...records[1], inputTokensCount: 41 },
      ],
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          attributionVersion: 1,
        }
      );
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemKey: `run-usage:${context.runUsageModelId}:input`,
          itemType: "input",
          inputTokensCount: 100,
        }),
        expect.objectContaining({
          itemKey: `tool-action:${context.action.id}`,
          itemType: "tool",
          inputTokensCount: 40,
          outputTokensCount: 12,
          directCreditAmountMicro: 1_000_000,
        }),
      ])
    );
    expect(items.every((item) => item.completedAt !== null)).toBe(true);
  });

  it("completes an approval-spanning fact without rewriting completed evidence", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    await AgentMessageConsumptionItemResource.insertItemsIdempotently(auth, {
      ...context,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: 1,
      records: [
        {
          itemType: "tool",
          runUsageModelId: context.runUsageModelId,
          agentMCPActionModelId: context.action.id,
          inputTokensCount: null,
          outputTokensCount: 12,
          grossAttributedCreditAmountMicro: 400_000,
          directCreditAmountMicro: null,
          state: "pending",
        },
      ],
    });
    const [pending] =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          attributionVersion: 1,
        }
      );
    expect(pending).toMatchObject({
      inputTokensCount: null,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 400_000,
      completedAt: null,
    });

    const finalRecord = {
      itemType: "tool" as const,
      runUsageModelId: context.runUsageModelId,
      agentMCPActionModelId: context.action.id,
      inputTokensCount: 40,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
      state: "completed" as const,
    };
    await AgentMessageConsumptionItemResource.completeItemsIdempotently(auth, {
      ...context,
      attributionVersion: 1,
      records: [finalRecord],
    });
    const [completed] =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          attributionVersion: 1,
        }
      );
    expect(completed).toMatchObject({
      inputTokensCount: 40,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
    });
    expect(completed.completedAt).not.toBeNull();

    await AgentMessageConsumptionItemResource.completeItemsIdempotently(auth, {
      ...context,
      attributionVersion: 1,
      records: [{ ...finalRecord, inputTokensCount: 41 }],
    });
    await AgentMessageConsumptionItemResource.insertItemsIdempotently(auth, {
      ...context,
      attributionVersion: 1,
      records: [
        {
          ...finalRecord,
          inputTokensCount: null,
          grossAttributedCreditAmountMicro: 400_000,
          directCreditAmountMicro: null,
          state: "pending",
        },
      ],
    });

    const [unchanged] =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          attributionVersion: 1,
        }
      );
    expect(unchanged).toMatchObject({
      id: completed.id,
      inputTokensCount: 40,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
    });
  });

  it("inserts a completed fact when no pending row exists", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    await AgentMessageConsumptionItemResource.completeItemsIdempotently(auth, {
      ...context,
      attributionVersion: 1,
      records: [
        {
          itemType: "tool",
          runUsageModelId: context.runUsageModelId,
          agentMCPActionModelId: context.action.id,
          inputTokensCount: 40,
          outputTokensCount: 12,
          grossAttributedCreditAmountMicro: 2_000_000,
          directCreditAmountMicro: 1_000_000,
          state: "completed",
        },
      ],
    });

    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [context.agentMessageModelId],
        attributionVersion: 1,
      })
    ).resolves.toEqual([
      expect.objectContaining({
        itemKey: `tool-action:${context.action.id}`,
        inputTokensCount: 40,
        outputTokensCount: 12,
        completedAt: expect.any(Date),
      }),
    ]);
  });

  it("deletes facts only for the requested owning messages", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const first = await setupMessageWithEvidence(auth, workspace);
    const second = await setupMessageWithEvidence(auth, workspace);

    async function createToolFact(context: {
      conversationModelId: ModelId;
      agentMessageModelId: ModelId;
      runUsageModelId: ModelId;
      action: AgentMCPActionResource;
    }) {
      await AgentMessageConsumptionItemResource.insertItemsIdempotently(auth, {
        ...context,
        attributionVersion: 1,
        records: [
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            agentMCPActionModelId: context.action.id,
            inputTokensCount: null,
            outputTokensCount: 12,
            grossAttributedCreditAmountMicro: 400_000,
            directCreditAmountMicro: null,
            state: "pending",
          },
        ],
      });
    }
    await createToolFact(first);
    await createToolFact(second);

    await AgentMessageConsumptionItemResource.deleteByAgentMessageModelIds(
      auth,
      {
        agentMessageModelIds: [first.agentMessageModelId],
      }
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
