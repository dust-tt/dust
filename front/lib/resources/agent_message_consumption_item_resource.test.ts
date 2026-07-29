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
  it("creates pending facts idempotently and derives their identities", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    const sources = [
      {
        itemType: "input" as const,
        runUsageModelId: context.runUsageModelId,
      },
      {
        itemType: "tool" as const,
        runUsageModelId: context.runUsageModelId,
        agentMCPActionModelId: context.action.id,
      },
    ];

    await AgentMessageConsumptionItemResource.createPendingItems(auth, {
      ...context,
      attributionVersion: 1,
      sources,
    });
    await AgentMessageConsumptionItemResource.createPendingItems(auth, {
      ...context,
      attributionVersion: 1,
      sources,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelId(
        auth,
        {
          agentMessageModelId: context.agentMessageModelId,
          attributionVersion: 1,
        }
      );
    expect(items).toHaveLength(2);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemKey: `run-usage:${context.runUsageModelId}:input`,
          itemType: "input",
          completedAt: null,
        }),
        expect.objectContaining({
          itemKey: `tool-action:${context.action.id}`,
          itemType: "tool",
          completedAt: null,
        }),
      ])
    );

    await expect(
      AgentMessageConsumptionItemResource.setEvidence(auth, {
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: 1,
        evidence: {
          itemType: "input",
          runUsageModelId: context.runUsageModelId,
          inputTokensCount: 100,
          grossAttributedCreditAmountMicro: 300_000,
          state: "completed",
        },
      })
    ).resolves.toMatchObject({
      inputTokensCount: 100,
      outputTokensCount: null,
      directCreditAmountMicro: null,
    });
  });

  it("enriches a pending fact and makes completed evidence immutable", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    await AgentMessageConsumptionItemResource.createPendingItems(auth, {
      ...context,
      attributionVersion: 1,
      sources: [
        {
          itemType: "tool",
          runUsageModelId: context.runUsageModelId,
          agentMCPActionModelId: context.action.id,
        },
      ],
    });

    const pending = await AgentMessageConsumptionItemResource.setEvidence(
      auth,
      {
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: 1,
        evidence: {
          itemType: "tool",
          runUsageModelId: context.runUsageModelId,
          agentMCPActionModelId: context.action.id,
          inputTokensCount: null,
          outputTokensCount: 12,
          grossAttributedCreditAmountMicro: 400_000,
          directCreditAmountMicro: null,
          state: "pending",
        },
      }
    );
    expect(pending).toMatchObject({
      inputTokensCount: null,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 400_000,
      completedAt: null,
    });

    const finalEvidence = {
      itemType: "tool" as const,
      runUsageModelId: context.runUsageModelId,
      agentMCPActionModelId: context.action.id,
      inputTokensCount: 40,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
      state: "completed" as const,
    };
    const completed = await AgentMessageConsumptionItemResource.setEvidence(
      auth,
      {
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: 1,
        evidence: finalEvidence,
      }
    );
    expect(completed).toMatchObject({
      inputTokensCount: 40,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
    });
    expect(completed.completedAt).not.toBeNull();

    await expect(
      AgentMessageConsumptionItemResource.setEvidence(auth, {
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: 1,
        evidence: finalEvidence,
      })
    ).resolves.toMatchObject({ id: completed.id });

    await expect(
      AgentMessageConsumptionItemResource.setEvidence(auth, {
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: 1,
        evidence: {
          ...finalEvidence,
          inputTokensCount: 41,
        },
      })
    ).rejects.toThrow("Completed consumption item");
  });

  it("rejects evidence sources owned by another agent message", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const owner = await setupMessageWithEvidence(auth, workspace);
    const foreign = await setupMessageWithEvidence(auth, workspace);

    await expect(
      AgentMessageConsumptionItemResource.createPendingItems(auth, {
        conversationModelId: owner.conversationModelId,
        agentMessageModelId: owner.agentMessageModelId,
        attributionVersion: 1,
        sources: [
          {
            itemType: "tool",
            runUsageModelId: owner.runUsageModelId,
            agentMCPActionModelId: foreign.action.id,
          },
        ],
      })
    ).rejects.toThrow(
      "Consumption item action does not belong to the agent message"
    );

    await expect(
      AgentMessageConsumptionItemResource.createPendingItems(auth, {
        conversationModelId: owner.conversationModelId,
        agentMessageModelId: owner.agentMessageModelId,
        attributionVersion: 1,
        sources: [
          {
            itemType: "input",
            runUsageModelId: foreign.runUsageModelId,
          },
        ],
      })
    ).rejects.toThrow(
      "Consumption item run usage does not belong to the agent message"
    );
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
      await AgentMessageConsumptionItemResource.createPendingItems(auth, {
        ...context,
        attributionVersion: 1,
        sources: [
          {
            itemType: "tool",
            runUsageModelId: context.runUsageModelId,
            agentMCPActionModelId: context.action.id,
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
      AgentMessageConsumptionItemResource.listByAgentMessageModelId(auth, {
        agentMessageModelId: first.agentMessageModelId,
        attributionVersion: 1,
      })
    ).resolves.toHaveLength(0);
    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelId(auth, {
        agentMessageModelId: second.agentMessageModelId,
        attributionVersion: 1,
      })
    ).resolves.toHaveLength(1);
  });
});
