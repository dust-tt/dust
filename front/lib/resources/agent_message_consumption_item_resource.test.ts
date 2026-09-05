import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  CompletedToolConsumptionItem,
  PendingToolConsumptionItem,
} from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import { describe, expect, it, vi } from "vitest";

const ATTRIBUTION_VERSION = 1;

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
  const { run, runUsageModelId } = await RunFactory.createWithUsage(auth);
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: [run.dustRunId],
  });

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
    runUsageModelId,
    action,
  };
}

// A blocked tool's pending row: the emitted call output is known, the result footprint and charge
// are not.
function pendingTool(
  action: AgentMCPActionResource,
  runUsageModelId: ModelId
): PendingToolConsumptionItem {
  return {
    action,
    runUsageModelId,
    outputTokensCount: 12,
    grossAttributedCreditAmountMicro: 400_000,
  };
}

// A settled tool's completed row: result footprint and direct charge are now known.
function completedTool(
  action: AgentMCPActionResource,
  runUsageModelId: ModelId
): CompletedToolConsumptionItem {
  return {
    itemType: "tool",
    runUsageModelId,
    action,
    inputTokensCount: 40,
    outputTokensCount: 12,
    grossAttributedCreditAmountMicro: 2_000_000,
    directCreditAmountMicro: 1_000_000,
  };
}

async function listTools(
  auth: Authenticator,
  agentMessageModelId: ModelId
): Promise<AgentMessageConsumptionItemResource[]> {
  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessageModelId],
      maxAttributionVersion: ATTRIBUTION_VERSION,
    });
  return items.filter((item) => item.itemType === "tool");
}

describe("AgentMessageConsumptionItemResource", () => {
  it("narrows model and tool items at the resource seam", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [
        {
          itemType: "system",
          runUsageModelId: context.runUsageModelId,
          inputTokensCount: 10,
          grossAttributedCreditAmountMicro: 100_000,
        },
        {
          itemType: "input",
          runUsageModelId: context.runUsageModelId,
          inputTokensCount: 20,
          grossAttributedCreditAmountMicro: 200_000,
        },
        {
          itemType: "output",
          runUsageModelId: context.runUsageModelId,
          outputTokensCount: 30,
          grossAttributedCreditAmountMicro: 300_000,
        },
        {
          itemType: "reasoning",
          runUsageModelId: context.runUsageModelId,
          outputTokensCount: 40,
          grossAttributedCreditAmountMicro: 400_000,
        },
        completedTool(context.action, context.runUsageModelId),
      ],
      pendingToolItems: [],
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          maxAttributionVersion: ATTRIBUTION_VERSION,
        }
      );

    expect(items).toHaveLength(5);
    for (const item of items) {
      if (item.itemType === "tool") {
        expect(item.isModelItem()).toBe(false);
        assert(item.isToolItem(), "Tool item was not narrowed");
        expect(item.agentMCPActionId).toBe(context.action.id);
      } else {
        expect(item.isToolItem()).toBe(false);
        assert(item.isModelItem(), "Model item was not narrowed");
        expect(item.agentMCPActionId).toBeNull();
        expect(item.directCreditAmountMicro).toBeNull();
        expect(item.completedAt).toBeInstanceOf(Date);
      }
    }
  });

  it("rejects a malformed tool shape while narrowing", () => {
    const item = new AgentMessageConsumptionItemResource(
      AgentMessageConsumptionItemResource.model,
      AgentMessageConsumptionItemModel.build({
        id: -1,
        workspaceId: -1,
        conversationId: -1,
        agentMessageId: -1,
        runUsageId: -1,
        agentMCPActionId: null,
        itemKey: "tool-action:invalid",
        itemType: "tool",
        attributionVersion: ATTRIBUTION_VERSION,
        inputTokensCount: 0,
        outputTokensCount: 0,
        grossAttributedCreditAmountMicro: 0,
        directCreditAmountMicro: 0,
        completedAt: new Date(),
      }).get()
    );

    expect(() => item.isToolItem()).toThrow(
      "Tool consumption item is missing its action"
    );
  });

  it("keeps pending state exclusive to incomplete tools", async () => {
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
      attributionVersion: ATTRIBUTION_VERSION,
      inputTokensCount: 100,
      outputTokensCount: null,
      grossAttributedCreditAmountMicro: 300_000,
      directCreditAmountMicro: null,
      completedAt: null,
    });

    await expect(item.validate()).rejects.toThrow(
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
      attributionVersion: ATTRIBUTION_VERSION,
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

  it("inserts model buckets once and keeps the first values on a re-finalize", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    const inputRow = {
      itemType: "input" as const,
      runUsageModelId: context.runUsageModelId,
      inputTokensCount: 100,
      grossAttributedCreditAmountMicro: 300_000,
    };

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [inputRow],
      pendingToolItems: [],
    });
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [{ ...inputRow, inputTokensCount: 101 }],
      pendingToolItems: [],
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          maxAttributionVersion: ATTRIBUTION_VERSION,
        }
      );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemKey: `run-usage:${context.runUsageModelId}:input`,
      inputTokensCount: 100,
      completedAt: expect.any(Date),
    });
  });

  it("inserts an already-final tool without a prior pending row", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    const findAllSpy = vi.spyOn(AgentMessageConsumptionItemModel, "findAll");

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [completedTool(context.action, context.runUsageModelId)],
      pendingToolItems: [],
    });
    expect(findAllSpy).not.toHaveBeenCalled();
    findAllSpy.mockRestore();

    const tools = await listTools(auth, context.agentMessageModelId);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      itemKey: `tool-action:${context.action.id}`,
      inputTokensCount: 40,
      outputTokensCount: 12,
      directCreditAmountMicro: 1_000_000,
      completedAt: expect.any(Date),
    });
  });

  it("writes model buckets, final tools and blocked tools in a single pass", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    const { action: blockedAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: context.conversation.id,
      agentMessageModelId: context.agentMessageModelId,
    });
    const findAllSpy = vi.spyOn(AgentMessageConsumptionItemModel, "findAll");

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [
        {
          itemType: "input",
          runUsageModelId: context.runUsageModelId,
          inputTokensCount: 100,
          grossAttributedCreditAmountMicro: 300_000,
        },
        completedTool(context.action, context.runUsageModelId),
      ],
      pendingToolItems: [pendingTool(blockedAction, context.runUsageModelId)],
    });
    expect(findAllSpy).not.toHaveBeenCalled();
    findAllSpy.mockRestore();

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [context.agentMessageModelId],
          maxAttributionVersion: ATTRIBUTION_VERSION,
        }
      );
    expect(items).toHaveLength(3);
    expect(
      items.find(
        (item) => item.itemKey === `run-usage:${context.runUsageModelId}:input`
      )
    ).toMatchObject({ inputTokensCount: 100, completedAt: expect.any(Date) });
    expect(
      items.find((item) => item.itemKey === `tool-action:${context.action.id}`)
    ).toMatchObject({
      inputTokensCount: 40,
      directCreditAmountMicro: 1_000_000,
      completedAt: expect.any(Date),
    });
    expect(
      items.find((item) => item.itemKey === `tool-action:${blockedAction.id}`)
    ).toMatchObject({
      inputTokensCount: null,
      directCreditAmountMicro: null,
      completedAt: null,
    });
  });

  it("completes a tool that an earlier pass left pending, in place", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    // The tool was blocked when the first pass ran: only a pending row.
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [],
      pendingToolItems: [pendingTool(context.action, context.runUsageModelId)],
    });

    const afterFirstPass = await listTools(auth, context.agentMessageModelId);
    expect(afterFirstPass).toHaveLength(1);
    expect(afterFirstPass[0]).toMatchObject({
      inputTokensCount: null,
      directCreditAmountMicro: null,
      completedAt: null,
    });

    // The tool settled: the second pass completes the same row through the upsert.
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [
        {
          ...completedTool(context.action, context.runUsageModelId),
          outputTokensCount: 99,
        },
      ],
      pendingToolItems: [],
    });

    const afterSettle = await listTools(auth, context.agentMessageModelId);
    expect(afterSettle).toHaveLength(1);
    expect(afterSettle[0]).toMatchObject({
      itemKey: `tool-action:${context.action.id}`,
      inputTokensCount: 40,
      // The output footprint was already known when the pending row was created.
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
      completedAt: expect.any(Date),
    });
  });

  it("keeps completed tool evidence immutable on a re-finalize", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);
    const original = completedTool(context.action, context.runUsageModelId);

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [original],
      pendingToolItems: [],
    });
    const [before] = await listTools(auth, context.agentMessageModelId);

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [
        {
          ...original,
          inputTokensCount: 41,
          outputTokensCount: 13,
          grossAttributedCreditAmountMicro: 3_000_000,
          directCreditAmountMicro: 2_000_000,
        },
      ],
      pendingToolItems: [],
    });

    const [after] = await listTools(auth, context.agentMessageModelId);
    expect(after).toMatchObject({
      inputTokensCount: 40,
      outputTokensCount: 12,
      grossAttributedCreditAmountMicro: 2_000_000,
      directCreditAmountMicro: 1_000_000,
    });
    expect(after.completedAt).toEqual(before.completedAt);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("does not regress a completed tool back to pending", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [completedTool(context.action, context.runUsageModelId)],
      pendingToolItems: [],
    });

    // A late or racing pass that still sees the tool as blocked must not overwrite the completed row.
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation: context.conversation,
      agentMessageModelId: context.agentMessageModelId,
      attributionVersion: ATTRIBUTION_VERSION,
      records: [],
      pendingToolItems: [pendingTool(context.action, context.runUsageModelId)],
    });

    const tools = await listTools(auth, context.agentMessageModelId);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      inputTokensCount: 40,
      directCreditAmountMicro: 1_000_000,
      completedAt: expect.any(Date),
    });
  });

  it("keeps final evidence when pending and completed passes race", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const context = await setupMessageWithEvidence(auth, workspace);

    await Promise.all([
      AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: ATTRIBUTION_VERSION,
        records: [completedTool(context.action, context.runUsageModelId)],
        pendingToolItems: [],
      }),
      AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: ATTRIBUTION_VERSION,
        records: [],
        pendingToolItems: [
          pendingTool(context.action, context.runUsageModelId),
        ],
      }),
    ]);

    const tools = await listTools(auth, context.agentMessageModelId);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      inputTokensCount: 40,
      outputTokensCount: 12,
      directCreditAmountMicro: 1_000_000,
      completedAt: expect.any(Date),
    });
  });

  it("deletes facts only for the requested owning messages", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const first = await setupMessageWithEvidence(auth, workspace);
    const second = await setupMessageWithEvidence(auth, workspace);

    const createToolFact = async (context: {
      conversation: ConversationResource;
      agentMessageModelId: ModelId;
      runUsageModelId: ModelId;
      action: AgentMCPActionResource;
    }) => {
      await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
        conversation: context.conversation,
        agentMessageModelId: context.agentMessageModelId,
        attributionVersion: ATTRIBUTION_VERSION,
        records: [],
        pendingToolItems: [
          pendingTool(context.action, context.runUsageModelId),
        ],
      });
    };
    await createToolFact(first);
    await createToolFact(second);

    await AgentMessageConsumptionItemResource.deleteByAgentMessageModelIds(
      auth,
      { agentMessageModelIds: [first.agentMessageModelId] }
    );

    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [first.agentMessageModelId],
        maxAttributionVersion: ATTRIBUTION_VERSION,
      })
    ).resolves.toHaveLength(0);
    await expect(
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [second.agentMessageModelId],
        maxAttributionVersion: ATTRIBUTION_VERSION,
      })
    ).resolves.toHaveLength(1);
  });
});
