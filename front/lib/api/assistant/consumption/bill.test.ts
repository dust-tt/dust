import { billExecution } from "@app/lib/api/assistant/consumption/bill";
import { hasConsumptionEventForIdempotencyKey } from "@app/lib/api/assistant/consumption/events";
import { recordModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_writer";
import { recordToolCompletionConsumption } from "@app/lib/api/assistant/consumption/tool_completion_writer";
import { INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/consumption/version";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG } from "@app/types/assistant/models/anthropic";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { ModelIdType } from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

const TOKENS_PER_FOOTPRINT = 7;
const RUN_KEY_X = "execution-x";
const RUN_KEY_Y = "execution-y";

async function setupMessage() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
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
    runIds: [],
  });

  return {
    auth,
    workspace,
    conversation,
    agentMessage,
    context: {
      agentMessageId: agentMessage.sId,
      agentMessageModelId: agentMessage.agentMessageId,
      conversationModelId: conversation.id,
      rootAgentMessageId: agentMessage.sId,
      runKey: RUN_KEY_X,
    },
  };
}

async function recordModelCall(
  auth: Authenticator,
  {
    context,
    emittedActions = [],
    inputTokens,
    modelId,
    outputTokens,
  }: {
    context: Parameters<typeof recordModelCallConsumption>[1]["context"];
    emittedActions?: AgentMCPActionResource[];
    inputTokens: number;
    modelId?: ModelIdType;
    outputTokens: number;
  }
) {
  const { run } = await RunFactory.createWithUsage(auth, {
    inputTokens,
    modelId,
    outputTokens,
  });
  await recordModelCallConsumption(auth, {
    context,
    dustRunId: run.dustRunId,
    emittedActions,
  });

  return run;
}

async function listConsumptionItems(
  auth: Authenticator,
  agentMessageModelId: ModelId
) {
  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessageModelId],
      maxAttributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
    });

  return items.filter(
    (item) =>
      item.attributionVersion === INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION
  );
}

function sumReconciled(
  items: AgentMessageConsumptionItemResource[],
  runKey?: string
): number {
  return items
    .filter((item) => runKey === undefined || item.runKey === runKey)
    .reduce(
      (total, item) => total + (item.reconciledCreditAmountMicro ?? 0),
      0
    );
}

async function billFinalizedExecution(
  auth: Authenticator,
  args: Parameters<typeof billExecution>[1]
) {
  return billExecution(auth, args);
}

describe("billExecution", () => {
  beforeEach(() => {
    vi.mocked(getLlmCredentials).mockResolvedValue({} as never);
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map(() => TOKENS_PER_FOOTPRINT))
    );
  });

  it("carries the model-group rounding remainder on one row", async () => {
    const { auth, context } = await setupMessage();
    await recordModelCall(auth, {
      context,
      inputTokens: 2_000,
      outputTokens: 300,
    });

    const bill = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    const roundingRows = items.filter((item) => item.itemType === "rounding");
    expect(roundingRows).toHaveLength(1);
    expect(roundingRows[0]).toMatchObject({
      grossAttributedCreditAmountMicro: 0,
      inputTokensCount: null,
      outputTokensCount: null,
      runKey: RUN_KEY_X,
    });

    expect(bill?.eventCreditAmount).toBeGreaterThan(0);
    expect(sumReconciled(items, RUN_KEY_X)).toBe(
      (bill?.eventCreditAmount ?? 0) * MICRO_CREDITS_PER_CREDIT
    );
    await expect(
      hasConsumptionEventForIdempotencyKey(auth, {
        idempotencyKey: `execution:${RUN_KEY_X}:billed`,
      })
    ).resolves.toBe(true);
  });

  it("rounds model cost once per provider and model group", async () => {
    const { auth, context } = await setupMessage();
    await recordModelCall(auth, {
      context,
      inputTokens: 1,
      outputTokens: 1,
      modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
    });
    await recordModelCall(auth, {
      context,
      inputTokens: 1,
      outputTokens: 1,
      modelId: CLAUDE_4_5_HAIKU_DEFAULT_MODEL_CONFIG.modelId,
    });

    const bill = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });

    expect(bill?.eventCreditAmount).toBe(2);
  });

  it("sums the message's credits over its billed executions", async () => {
    const { auth, context } = await setupMessage();
    await recordModelCall(auth, {
      context,
      inputTokens: 2_000,
      outputTokens: 300,
    });
    const billX = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });

    const resumedContext = { ...context, runKey: RUN_KEY_Y };
    await recordModelCall(auth, {
      context: resumedContext,
      inputTokens: 3_800,
      outputTokens: 200,
    });
    const billY = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_Y,
    });

    expect(billY?.costCredits).toBe(
      (billX?.eventCreditAmount ?? 0) + (billY?.eventCreditAmount ?? 0)
    );
  });

  it("changes nothing when the same execution is billed twice", async () => {
    const { auth, context } = await setupMessage();
    await recordModelCall(auth, {
      context,
      inputTokens: 2_000,
      outputTokens: 300,
    });

    const first = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });
    const firstItems = await listConsumptionItems(
      auth,
      context.agentMessageModelId
    );

    const second = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });
    const secondItems = await listConsumptionItems(
      auth,
      context.agentMessageModelId
    );

    expect(second?.eventCreditAmount).toBe(first?.eventCreditAmount);
    expect(second?.costCredits).toBe(first?.costCredits);
    expect(secondItems).toHaveLength(firstItems.length);
    expect(sumReconciled(secondItems)).toBe(sumReconciled(firstItems));
  });

  it("includes the tool charge in the execution's one event", async () => {
    const { auth, workspace, conversation, agentMessage, context } =
      await setupMessage();
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      output: [{ type: "text", text: "tool result" }],
    });
    await recordModelCall(auth, {
      context,
      emittedActions: [action],
      inputTokens: 2_000,
      outputTokens: 300,
    });
    await action.markAsSucceeded({ executionDurationMs: 5 });
    const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );
    if (!settledAction) {
      throw new Error("Settled action not found");
    }
    await recordToolCompletionConsumption(auth, {
      action: settledAction,
      context,
    });

    const bill = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    expect(bill?.eventCreditAmount).toBeGreaterThanOrEqual(3);
    expect(sumReconciled(items, RUN_KEY_X)).toBe(
      (bill?.eventCreditAmount ?? 0) * MICRO_CREDITS_PER_CREDIT
    );
    expect(bill?.actionModelIds).toEqual([action.id]);
  });

  it("settles the server cap in creation order with signed postings", async () => {
    const { auth, workspace, conversation, agentMessage, context } =
      await setupMessage();
    const actions: AgentMCPActionResource[] = [];
    for (let index = 0; index < 8; index++) {
      const { action } = await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        step: index + 1,
        output: [{ type: "text", text: "tool result" }],
      });
      actions.push(action);
    }
    await recordModelCall(auth, {
      context,
      emittedActions: actions,
      inputTokens: 2_000,
      outputTokens: 300,
    });

    for (const action of [...actions].reverse()) {
      await action.markAsSucceeded({ executionDurationMs: 5 });
      const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
      if (!settledAction) {
        throw new Error("Settled action not found");
      }
      await recordToolCompletionConsumption(auth, {
        action: settledAction,
        context,
      });
    }

    await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    const firstDirect = items.find(
      (item) =>
        item.itemType === "tool_direct" &&
        item.agentMCPActionId === actions[0].id
    );
    const lastDirect = items.find(
      (item) =>
        item.itemType === "tool_direct" &&
        item.agentMCPActionId === actions[7].id
    );
    const firstAdjustment = items.find(
      (item) =>
        item.itemType === "tool_adjustment" &&
        item.agentMCPActionId === actions[0].id
    );
    const lastAdjustment = items.find(
      (item) =>
        item.itemType === "tool_adjustment" &&
        item.agentMCPActionId === actions[7].id
    );
    expect(firstDirect?.directCreditAmountMicro).toBe(0);
    expect(firstAdjustment?.directCreditAmountMicro).toBe(
      3 * MICRO_CREDITS_PER_CREDIT
    );
    expect(lastDirect?.directCreditAmountMicro).toBe(
      3 * MICRO_CREDITS_PER_CREDIT
    );
    expect(lastAdjustment?.directCreditAmountMicro).toBe(
      -3 * MICRO_CREDITS_PER_CREDIT
    );
  });

  it("counts an execution whose rows already sum to whole credits", async () => {
    const { auth, workspace, conversation, agentMessage, context } =
      await setupMessage();
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      output: [{ type: "text", text: "tool result" }],
    });
    await recordModelCall(auth, {
      context,
      emittedActions: [action],
      inputTokens: 2_000,
      outputTokens: 300,
    });
    const billX = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });

    await action.markAsSucceeded({ executionDurationMs: 5 });
    const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );
    if (!settledAction) {
      throw new Error("Settled action not found");
    }
    await recordToolCompletionConsumption(auth, {
      action: settledAction,
      context: { ...context, runKey: RUN_KEY_Y },
    });

    const billY = await billFinalizedExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_Y,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    expect(
      items.filter(
        (item) => item.itemType === "rounding" && item.runKey === RUN_KEY_Y
      )
    ).toHaveLength(1);
    expect(billY?.eventCreditAmount).toBe(3);
    expect(billY?.costCredits).toBe(
      (billX?.eventCreditAmount ?? 0) + (billY?.eventCreditAmount ?? 0)
    );
  });

  it("bills incurred consumption without a status gate", async () => {
    const { auth, context } = await setupMessage();
    await recordModelCall(auth, {
      context,
      inputTokens: 2_000,
      outputTokens: 300,
    });
    const bill = await billExecution(auth, {
      agentMessageId: context.agentMessageId,
      rootAgentMessageId: context.rootAgentMessageId,
      runKey: RUN_KEY_X,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    expect(items.some((item) => item.itemType === "rounding")).toBe(true);
    expect(bill?.eventCreditAmount).toBeGreaterThan(0);
    expect(sumReconciled(items)).toBe(
      (bill?.eventCreditAmount ?? 0) * MICRO_CREDITS_PER_CREDIT
    );
  });
});
