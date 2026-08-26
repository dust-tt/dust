import { creditAmountMicroFromCostMicroUsd } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { hasConsumptionEventForIdempotencyKey } from "@app/lib/api/assistant/consumption/events";
import { recordModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_writer";
import { recordToolCompletionConsumption } from "@app/lib/api/assistant/consumption/tool_completion_writer";
import { INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/consumption/version";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

const INPUT_TOKENS_COUNT = 1_000;
const OUTPUT_TOKENS_COUNT = 200;
const TOKENS_PER_FOOTPRINT = 7;

const RUN_KEY_X = "execution-x";
const RUN_KEY_Y = "execution-y";

const EXTERNAL_TOOL_CHARGE_MICRO = 3 * MICRO_CREDITS_PER_CREDIT;

async function setupToolCall() {
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
  const { run } = await RunFactory.createWithUsage(auth, {
    inputTokens: INPUT_TOKENS_COUNT,
    outputTokens: OUTPUT_TOKENS_COUNT,
  });
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
    dustRunId: run.dustRunId,
    output: [{ type: "text", text: "tool result" }],
  });

  const context = {
    agentMessageId: agentMessage.sId,
    agentMessageModelId: agentMessage.agentMessageId,
    conversationModelId: conversation.id,
    rootAgentMessageId: agentMessage.sId,
    runKey: RUN_KEY_X,
  };

  await recordModelCallConsumption(auth, {
    context,
    dustRunId: run.dustRunId,
    emittedActions: [action],
  });

  return { auth, workspace, conversation, run, agentMessage, action, context };
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

async function hasConsumptionEvent(
  auth: Authenticator,
  idempotencyKey: string
): Promise<boolean> {
  return hasConsumptionEventForIdempotencyKey(auth, { idempotencyKey });
}

describe("recordToolCompletionConsumption", () => {
  beforeEach(() => {
    vi.mocked(getLlmCredentials).mockResolvedValue({} as never);
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map(() => TOKENS_PER_FOOTPRINT))
    );
  });

  it("adds a direct posting with the charge and measured result footprint", async () => {
    const { auth, action, context, run } = await setupToolCall();
    await action.markAsSucceeded({ executionDurationMs: 10 });
    const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );

    await recordToolCompletionConsumption(auth, {
      action: settledAction!,
      context,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    const toolRow = items.find((item) => item.itemType === "tool_direct");
    expect(toolRow).toMatchObject({
      completedAt: expect.any(Date),
      directCreditAmountMicro: EXTERNAL_TOOL_CHARGE_MICRO,
      inputTokensCount: TOKENS_PER_FOOTPRINT,
      runKey: RUN_KEY_X,
    });

    const [usage] = await RunResource.listRunUsagesForRuns(auth, {
      runs: [run],
    });
    expect(sumReconciled(items, RUN_KEY_X)).toBe(
      creditAmountMicroFromCostMicroUsd(usage.costMicroUsd) +
        EXTERNAL_TOOL_CHARGE_MICRO
    );
    await expect(
      hasConsumptionEvent(auth, `tool-completion:${action.id}:${RUN_KEY_X}`)
    ).resolves.toBe(true);
  });

  it("posts a tool completion once, however often the writer retries", async () => {
    const { auth, action, context } = await setupToolCall();
    await action.markAsSucceeded({ executionDurationMs: 10 });
    const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );

    await recordToolCompletionConsumption(auth, {
      action: settledAction!,
      context,
    });
    const firstPass = await listConsumptionItems(
      auth,
      context.agentMessageModelId
    );

    await recordToolCompletionConsumption(auth, {
      action: settledAction!,
      context,
    });
    const secondPass = await listConsumptionItems(
      auth,
      context.agentMessageModelId
    );

    expect(sumReconciled(secondPass)).toBe(sumReconciled(firstPass));
    await expect(
      hasConsumptionEvent(auth, `tool-completion:${action.id}:${RUN_KEY_X}`)
    ).resolves.toBe(true);
  });

  it("posts consumed result credit to the model call that uses it", async () => {
    const { auth, action, context } = await setupToolCall();
    await action.markAsSucceeded({ executionDurationMs: 10 });
    const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );
    await recordToolCompletionConsumption(auth, {
      action: settledAction!,
      context,
    });

    const { run: consumingRun, runUsageModelId } =
      await RunFactory.createWithUsage(auth, {
        inputTokens: INPUT_TOKENS_COUNT,
        outputTokens: OUTPUT_TOKENS_COUNT,
      });
    await recordModelCallConsumption(auth, {
      context: { ...context, runKey: RUN_KEY_Y },
      dustRunId: consumingRun.dustRunId,
      emittedActions: [],
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    const resultRow = items.find((item) => item.itemType === "tool_result");
    expect(resultRow).toMatchObject({
      agentMCPActionId: action.id,
      inputTokensCount: TOKENS_PER_FOOTPRINT,
      runKey: RUN_KEY_Y,
      runUsageId: runUsageModelId,
    });
    const [usage] = await RunResource.listRunUsagesForRuns(auth, {
      runs: [consumingRun],
    });
    expect(sumReconciled(items, RUN_KEY_Y)).toBe(
      creditAmountMicroFromCostMicroUsd(usage.costMicroUsd)
    );
  });

  it("keeps the call in its execution and posts completion to the restarted execution", async () => {
    const { auth, action, context, run } = await setupToolCall();
    const beforeItems = await listConsumptionItems(
      auth,
      context.agentMessageModelId
    );
    const emittedToolRow = beforeItems.find(
      (item) => item.itemType === "tool_call"
    );
    const callCreditAmountMicro =
      emittedToolRow?.reconciledCreditAmountMicro ?? 0;
    expect(callCreditAmountMicro).toBeGreaterThan(0);
    const [usage] = await RunResource.listRunUsagesForRuns(auth, {
      runs: [run],
    });
    const exactCreditAmountMicro = creditAmountMicroFromCostMicroUsd(
      usage.costMicroUsd
    );

    await action.markAsSucceeded({ executionDurationMs: 10 });
    const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );
    await recordToolCompletionConsumption(auth, {
      action: settledAction!,
      context: { ...context, runKey: RUN_KEY_Y },
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    const callRow = items.find((item) => item.itemType === "tool_call");
    const directRow = items.find((item) => item.itemType === "tool_direct");

    expect(callRow?.runKey).toBe(RUN_KEY_X);
    expect(callRow?.reconciledCreditAmountMicro).toBe(callCreditAmountMicro);
    expect(directRow?.runKey).toBe(RUN_KEY_Y);
    expect(directRow?.reconciledCreditAmountMicro).toBe(
      EXTERNAL_TOOL_CHARGE_MICRO
    );
    expect(sumReconciled(items, RUN_KEY_X)).toBe(exactCreditAmountMicro);
    expect(sumReconciled(items, RUN_KEY_Y)).toBe(EXTERNAL_TOOL_CHARGE_MICRO);
    await expect(
      hasConsumptionEvent(auth, `tool-compensation:${action.id}:${RUN_KEY_X}`)
    ).resolves.toBe(false);
    await expect(
      hasConsumptionEvent(auth, `tool-completion:${action.id}:${RUN_KEY_Y}`)
    ).resolves.toBe(true);
  });

  it("meters a denied tool without charging it", async () => {
    const { auth, action, context } = await setupToolCall();
    await action.updateStatus("denied");
    const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      action.id
    );

    await recordToolCompletionConsumption(auth, {
      action: settledAction!,
      context,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    const toolRow = items.find((item) => item.itemType === "tool_direct");
    expect(toolRow).toMatchObject({
      completedAt: expect.any(Date),
      directCreditAmountMicro: 0,
      inputTokensCount: TOKENS_PER_FOOTPRINT,
    });
  });

  it("records a sandbox child as a charge-only posting anchored to its parent call", async () => {
    const {
      auth,
      workspace,
      conversation,
      agentMessage,
      action: parentAction,
      context,
    } = await setupToolCall();
    const { action: childAction } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      dustRunId: parentAction.stepContent.dustRunId,
      output: [{ type: "text", text: "nested tool result" }],
      parentAction,
      sandboxChildActionInfo: { parentActionId: parentAction.sId },
    });
    await childAction.markAsSucceeded({ executionDurationMs: 10 });
    const settledChild = await AgentMCPActionResource.fetchByModelIdWithAuth(
      auth,
      childAction.id
    );

    await recordToolCompletionConsumption(auth, {
      action: settledChild!,
      context,
    });

    const items = await listConsumptionItems(auth, context.agentMessageModelId);
    const parentCall = items.find(
      (item) =>
        item.itemType === "tool_call" &&
        item.agentMCPActionId === parentAction.id
    );
    const childRows = items.filter(
      (item) => item.agentMCPActionId === childAction.id
    );
    expect(childRows).toHaveLength(1);
    expect(childRows[0]).toMatchObject({
      itemType: "tool_direct",
      runUsageId: parentCall?.runUsageId,
      inputTokensCount: 0,
      outputTokensCount: null,
      directCreditAmountMicro: EXTERNAL_TOOL_CHARGE_MICRO,
    });
  });

  it("stops charging one MCP server past the per-message cap", async () => {
    const { auth, workspace, conversation, agentMessage, context } =
      await setupToolCall();
    const { run } = await RunFactory.createWithUsage(auth, {
      inputTokens: INPUT_TOKENS_COUNT,
      outputTokens: OUTPUT_TOKENS_COUNT,
    });

    const actions: AgentMCPActionResource[] = [];
    for (let index = 0; index < 8; index++) {
      const { action } = await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        dustRunId: run.dustRunId,
        step: index + 2,
        output: [{ type: "text", text: "tool result" }],
      });
      actions.push(action);
    }
    await recordModelCallConsumption(auth, {
      context,
      dustRunId: run.dustRunId,
      emittedActions: actions,
    });

    const chargedAmountsMicro: number[] = [];
    for (const action of actions) {
      await action.markAsSucceeded({ executionDurationMs: 1 });
      const settledAction = await AgentMCPActionResource.fetchByModelIdWithAuth(
        auth,
        action.id
      );
      await recordToolCompletionConsumption(auth, {
        action: settledAction!,
        context,
      });

      const row =
        await AgentMessageConsumptionItemResource.fetchConsumptionToolDirectRow(
          auth,
          {
            agentMCPActionModelId: action.id,
          }
        );
      chargedAmountsMicro.push(row?.directCreditAmountMicro ?? 0);
    }

    expect(chargedAmountsMicro).toEqual([
      ...Array.from({ length: 7 }, () => EXTERNAL_TOOL_CHARGE_MICRO),
      0,
    ]);
  });
});
