import { isToolExecutionStatusBillable } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { creditsForInputTokens } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { measureToolCallFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getAttachmentCapabilityContext } from "@app/lib/api/assistant/conversation/attachment_capabilities";
import type { Authenticator } from "@app/lib/auth";
import {
  getMCPServerBillingKey,
  getToolBillingInfo,
  isFreeOrigin,
  MCP_SERVER_AGENT_MESSAGE_TOOL_AWU_CAP,
  TOOL_COST_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/credits/agent_message_billing";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/credit_consumption/client";
import { isTerminalAgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Transaction } from "sequelize";

type ToolCompletionConsumptionContext = {
  agentMessageId: string;
  agentMessageModelId: ModelId;
  rootAgentMessageId: ModelId;
  runKey: string;
};

type ToolCompletionSettlement = {
  chargeMicro: number;
  reallocatedCallFootprintCreditAmountMicro: number;
};

function billingActionOf(action: AgentMCPActionResource) {
  return {
    internalMCPServerName: action.metadata.internalMCPServerName,
    mcpServerId: action.metadata.mcpServerId ?? null,
    status: action.status,
    toolName: getToolNameFromFunctionCallName(action.functionCallName),
  };
}

/**
 * @cc [owner:id13,label:backend;data-integrity] cross-execution-tool-settlement
 * When a tool completes in a different execution, its call-footprint credit MUST remain attributed
 * to the emitting execution while its result footprint and direct charge MUST belong to the
 * completing execution. Both executions' item events MUST be appended in the settlement
 * transaction.
 *
 * ```text
 * model emits tool        tool reaches a terminal state
 *        │                              │
 *        ▼                              ▼
 * [pending tool row] ──► [measure result + rate charge]
 *                                │
 *                                ▼
 *                    [atomic settlement transaction]
 *                                │
 *                                ▼
 *                  [signal every affected execution]
 * ```
 */
/**
 * @cc [owner:id13,label:backend;concurrency] idempotent-tool-completion
 * Only the first writer that completes a pending tool row MAY change credits or append settlement
 * events. Retries MAY repeat read-only preparation, but MUST NOT change settled amounts or append
 * another settlement event.
 */
export async function recordToolCompletionConsumption(
  auth: Authenticator,
  {
    context,
    action,
  }: {
    context: ToolCompletionConsumptionContext;
    action: AgentMCPActionResource;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const toolRow =
    await AgentMessageConsumptionItemResource.fetchConsumptionToolRow(auth, {
      agentMCPActionModelId: action.id,
    });
  if (!toolRow) {
    return;
  }

  const [emittingUsage] = await RunResource.listRunUsagesByModelIds(auth, {
    runUsageModelIds: [toolRow.runUsageId],
  });
  if (!emittingUsage) {
    logger.warn(
      { workspaceId, actionId: action.sId },
      "[Consumption] Tool row has no emitting run usage."
    );
    return;
  }
  if (!toolRow.runKey) {
    throw new Error(`Consumption tool row ${toolRow.id} has no execution key`);
  }
  const emittingRunKey = toolRow.runKey;

  const affectedRunKeys = new Set([context.runKey]);
  affectedRunKeys.add(emittingRunKey);

  if (toolRow.completedAt !== null) {
    await signalAffectedExecutions(auth, affectedRunKeys);
    return;
  }

  const resultTokensCount = await measureResultFootprint(auth, {
    action,
    conversationModelId: toolRow.conversationId,
    usage: emittingUsage,
  });
  const resultCreditAmountMicro = creditsForInputTokens({
    usage: emittingUsage,
    tokensCount: resultTokensCount,
  });
  const chargeMicro = await rateToolCharge(auth, {
    action,
    agentMessageId: context.agentMessageId,
    agentMessageModelId: context.agentMessageModelId,
  });
  const settlement = await settleToolCompletion(auth, {
    actionModelId: action.id,
    chargeMicro,
    context,
    emittingRunKey,
    resultCreditAmountMicro,
    resultTokensCount,
    toolConsumptionItemModelId: toolRow.id,
    toolRunUsageModelId: toolRow.runUsageId,
  });

  await signalAffectedExecutions(auth, affectedRunKeys);

  if (settlement) {
    logger.info(
      {
        workspaceId,
        actionId: action.sId,
        runKey: context.runKey,
        chargeMicro: settlement.chargeMicro,
        reallocatedCallFootprintCreditAmountMicro:
          settlement.reallocatedCallFootprintCreditAmountMicro,
        resultTokensCount,
      },
      "[Consumption] Settled a tool row."
    );
  }
}

/**
 * @cc [owner:id13,label:backend;data-integrity] atomic-tool-completion
 * Completing the tool row, reallocating cross-execution call-footprint credit, and appending every
 * affected event MUST commit atomically. If any step fails, none of those changes may persist.
 *
 * ```text
 * BEGIN
 *   lock pending tool
 *          │
 *          ▼
 *   complete tool row
 *          │
 *          ├── execution changed ──► reallocate call-footprint credit
 *          │
 *          ▼
 *   append completion event
 *          │
 *          └── execution changed ──► append compensation event
 * COMMIT
 * ```
 */
async function settleToolCompletion(
  auth: Authenticator,
  {
    actionModelId,
    chargeMicro,
    context,
    emittingRunKey,
    resultCreditAmountMicro,
    resultTokensCount,
    toolConsumptionItemModelId,
    toolRunUsageModelId,
  }: {
    actionModelId: ModelId;
    chargeMicro: number;
    context: ToolCompletionConsumptionContext;
    emittingRunKey: string;
    resultCreditAmountMicro: number;
    resultTokensCount: number;
    toolConsumptionItemModelId: ModelId;
    toolRunUsageModelId: ModelId;
  }
): Promise<ToolCompletionSettlement | null> {
  return withTransaction(async (transaction) => {
    const completion =
      await AgentMessageConsumptionItemResource.completeConsumptionToolRow(
        auth,
        {
          consumptionItemId: toolConsumptionItemModelId,
          runKey: context.runKey,
          inputTokensCount: resultTokensCount,
          grossCreditAmountMicroDelta: resultCreditAmountMicro + chargeMicro,
          directCreditAmountMicro: chargeMicro,
          shouldReallocateCallFootprintCredit:
            emittingRunKey !== context.runKey,
          transaction,
        }
      );
    if (!completion) {
      return null;
    }
    const { reallocatedCallFootprintCreditAmountMicro } = completion;

    const emittingItemModelIds = [toolConsumptionItemModelId];
    if (reallocatedCallFootprintCreditAmountMicro > 0) {
      const emittingOutputModelId =
        await reallocateCallFootprintCreditToEmittingOutput(auth, {
          callFootprintCreditAmountMicro:
            reallocatedCallFootprintCreditAmountMicro,
          toolRunUsageModelId,
          transaction,
        });
      emittingItemModelIds.push(emittingOutputModelId);
    }

    await appendToolSettlementEvents(auth, {
      actionModelId,
      context,
      emittingItemModelIds,
      emittingRunKey,
      toolConsumptionItemModelId,
      transaction,
    });

    return { chargeMicro, reallocatedCallFootprintCreditAmountMicro };
  });
}

/**
 * @cc [owner:id13,label:backend;data-integrity] emitting-call-footprint-credit-reallocation
 * Cross-execution completion MUST move the tool's existing call-footprint credit to the emitting
 * model's output row before the tool row is attributed to the completing execution. A missing
 * output row MUST fail and roll back the settlement transaction.
 *
 * ```text
 * before
 * emitting execution    [output] [pending tool: call-footprint credit]
 *
 * after
 * emitting execution    [output + call-footprint credit]
 * completing execution  [completed tool: result footprint + direct charge]
 * ```
 */
async function reallocateCallFootprintCreditToEmittingOutput(
  auth: Authenticator,
  {
    callFootprintCreditAmountMicro,
    toolRunUsageModelId,
    transaction,
  }: {
    callFootprintCreditAmountMicro: number;
    toolRunUsageModelId: ModelId;
    transaction: Transaction;
  }
): Promise<ModelId> {
  const emittingOutputRow =
    await AgentMessageConsumptionItemResource.fetchConsumptionModelRow(auth, {
      runUsageModelId: toolRunUsageModelId,
      itemType: "output",
      transaction,
    });
  if (!emittingOutputRow) {
    throw new Error(
      `Cannot reallocate tool call-footprint credit without output row for run usage ${toolRunUsageModelId}`
    );
  }
  await AgentMessageConsumptionItemResource.addReconciledCreditAmounts(auth, {
    creditAmountMicroDeltaByConsumptionItemId: new Map([
      [emittingOutputRow.id, callFootprintCreditAmountMicro],
    ]),
    transaction,
  });
  return emittingOutputRow.id;
}

/**
 * @cc [owner:id13,label:backend;data-integrity] tool-settlement-event-fanout
 * Settlement MUST append one completion event for the completing execution. It MUST additionally
 * append one compensation event containing every changed emitting item if the execution changed,
 * and MUST NOT append that compensation event when both execution keys are equal.
 *
 * ```text
 * same execution
 * [settled tool] ──────────────────────────────► completion event
 *
 * different executions
 * [settled tool] ──────────────────────────────► completion event (completing)
 * [moved tool + reallocated output credit] ────► compensation event (emitting)
 * ```
 */
async function appendToolSettlementEvents(
  auth: Authenticator,
  {
    actionModelId,
    context,
    emittingItemModelIds,
    emittingRunKey,
    toolConsumptionItemModelId,
    transaction,
  }: {
    actionModelId: ModelId;
    context: ToolCompletionConsumptionContext;
    emittingItemModelIds: ModelId[];
    emittingRunKey: string;
    toolConsumptionItemModelId: ModelId;
    transaction: Transaction;
  }
): Promise<void> {
  await AgentMessageConsumptionEventResource.append(auth, {
    event: {
      kind: "items_changed",
      idempotencyKey: `tool-completion:${actionModelId}:${context.runKey}`,
      runKey: context.runKey,
      rootAgentMessageModelId: context.rootAgentMessageId,
      agentMessageModelId: context.agentMessageModelId,
      consumptionItemIds: [toolConsumptionItemModelId],
    },
    transaction,
  });

  if (emittingRunKey === context.runKey) {
    return;
  }

  await AgentMessageConsumptionEventResource.append(auth, {
    event: {
      kind: "items_changed",
      idempotencyKey: `tool-compensation:${actionModelId}:${emittingRunKey}`,
      runKey: emittingRunKey,
      rootAgentMessageModelId: context.rootAgentMessageId,
      agentMessageModelId: context.agentMessageModelId,
      consumptionItemIds: emittingItemModelIds,
    },
    transaction,
  });
}

/**
 * @cc [owner:id13,label:backend;reliability] signal-all-affected-executions
 * Every distinct execution whose items changed MUST be signaled after settlement commits. A signal
 * failure MUST be surfaced so the activity retry can recover the persisted outbox work.
 *
 * ```text
 * committed items ──► completing execution workflow
 *                 └─► emitting execution workflow (when different)
 * ```
 */
async function signalAffectedExecutions(
  auth: Authenticator,
  runKeys: Set<string>
): Promise<void> {
  for (const runKey of runKeys) {
    const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
      runKey,
    });
    if (signalRes.isErr()) {
      throw signalRes.error;
    }
  }
}

/**
 * @cc [owner:id13,label:backend;billing] tool-charge-eligibility
 * Non-billable, free-origin, terminal-message, and free-usage tools MUST rate to zero. A billable
 * tool with a server billing key MUST rate to zero after that server reaches its per-message cap.
 *
 * ```text
 * tool terminal state
 *        │
 *        ├── not billable / free / message terminal ──► 0
 *        │
 *        ▼
 * category rate
 *        │
 *        ├── no server key ───────────────────────────► rate
 *        └── server key ──► cap reached ? 0 : rate
 * ```
 */
async function rateToolCharge(
  auth: Authenticator,
  {
    action,
    agentMessageId,
    agentMessageModelId,
  }: {
    action: AgentMCPActionResource;
    agentMessageId: string;
    agentMessageModelId: ModelId;
  }
): Promise<number> {
  if (!isToolExecutionStatusBillable(action.status)) {
    return 0;
  }

  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });
  if (
    !creditContext ||
    isTerminalAgentMessageStatus(creditContext.status) ||
    isFreeOrigin(creditContext.triggeringUserMessageOrigin)
  ) {
    return 0;
  }

  const billingAction = billingActionOf(action);
  const { toolCostCategory, freeUsage } = getToolBillingInfo(
    billingAction.internalMCPServerName,
    billingAction.toolName
  );
  if (freeUsage) {
    return 0;
  }

  const ratedCreditAmountMicro = roundCreditsToMicroCredits(
    TOOL_COST_CATEGORY_AWU_WEIGHTS[toolCostCategory]
  );
  const mcpServerBillingKey = getMCPServerBillingKey(billingAction);
  if (mcpServerBillingKey === null) {
    return ratedCreditAmountMicro;
  }

  const chargedCreditAmountMicro = await chargedCreditsForMCPServer(auth, {
    agentMessageModelId,
    mcpServerBillingKey,
  });

  return chargedCreditAmountMicro >=
    roundCreditsToMicroCredits(MCP_SERVER_AGENT_MESSAGE_TOOL_AWU_CAP)
    ? 0
    : ratedCreditAmountMicro;
}

/**
 * @cc [owner:id13,label:backend;billing] server-charge-scope
 * The server cap total MUST include only direct tool credits from actions on the same agent message
 * whose canonical MCP server billing key equals the candidate tool's key.
 */
async function chargedCreditsForMCPServer(
  auth: Authenticator,
  {
    agentMessageModelId,
    mcpServerBillingKey,
  }: {
    agentMessageModelId: ModelId;
    mcpServerBillingKey: string;
  }
): Promise<number> {
  const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessageModelId,
  ]);
  const chargedRows =
    await AgentMessageConsumptionItemResource.listConsumptionChargedToolRows(
      auth,
      {
        agentMessageModelId,
      }
    );
  const actionModelIdsOfServer = new Set(
    actions
      .filter(
        (candidate) =>
          getMCPServerBillingKey(billingActionOf(candidate)) ===
          mcpServerBillingKey
      )
      .map((candidate) => candidate.id)
  );

  return chargedRows.reduce(
    (total, row) =>
      actionModelIdsOfServer.has(row.agentMCPActionId)
        ? total + (row.directCreditAmountMicro ?? 0)
        : total,
    0
  );
}

/**
 * @cc [owner:id13,label:backend;data-integrity] tool-result-footprint
 * Result footprint measurement MUST use the emitting run's model and the deleted-inclusive
 * conversation context. Missing enriched output MUST measure as zero; measurement errors MUST be
 * surfaced.
 */
async function measureResultFootprint(
  auth: Authenticator,
  {
    action,
    conversationModelId,
    usage,
  }: {
    action: AgentMCPActionResource;
    conversationModelId: ModelId;
    usage: RunUsageWithRunKeyType;
  }
): Promise<number> {
  const [conversation] = await ConversationResource.fetchByModelIds(
    auth,
    [conversationModelId],
    { includeDeleted: true }
  );
  if (!conversation) {
    throw new Error(
      `[Consumption] Conversation ${conversationModelId} not found while measuring a tool result.`
    );
  }
  const capabilities = await getAttachmentCapabilityContext(auth, conversation);

  const [enrichedAction] =
    await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
      actions: [action],
      ignoreContent: false,
    });
  if (!enrichedAction) {
    return 0;
  }

  const footprintsRes = await measureToolCallFootprints(auth, {
    capabilities,
    modelId: usage.modelId,
    toolCalls: [
      {
        action: enrichedAction,
        functionCallArguments: action.functionCallArguments,
      },
    ],
  });
  if (footprintsRes.isErr()) {
    throw footprintsRes.error;
  }

  return footprintsRes.value[0]?.inputTokensCount ?? 0;
}
