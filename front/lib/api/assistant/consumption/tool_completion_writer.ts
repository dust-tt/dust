import { isToolExecutionStatusBillable } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
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

function billingActionOf(action: AgentMCPActionResource) {
  return {
    internalMCPServerName: action.metadata.internalMCPServerName,
    mcpServerId: action.metadata.mcpServerId ?? null,
    status: action.status,
    toolName: getToolNameFromFunctionCallName(action.functionCallName),
  };
}

/**
 * @cc [owner:id13,label:backend;data-integrity] tool-completion-posting-ownership
 * A tool call MUST remain attributed to its emitting execution. Its direct charge MUST be posted to
 * the execution that observes completion, while its measured result footprint MUST remain available
 * for the model execution that consumes that result.
 *
 * ```text
 * emitting execution    [tool_call: call footprint]
 *                                  │
 * tool completes                   ├──► [tool_direct: charge + result evidence]
 *                                  │
 * result is consumed               └──► [tool_result: result footprint]
 * ```
 */
/**
 * @cc [owner:id13,label:backend;concurrency] idempotent-tool-completion-posting
 * Concurrent attempts MAY repeat read-only measurement and rating, but MUST create at most one
 * direct-charge posting and one corresponding outbox event per tool action.
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

  const ownToolCallRow =
    await AgentMessageConsumptionItemResource.fetchConsumptionToolCallRow(
      auth,
      {
        agentMCPActionModelId: action.id,
      }
    );
  const sandboxChildInfo = action.stepContext.sandboxChildActionInfo;
  const parentAction = isSandboxChildActionInfo(sandboxChildInfo)
    ? await AgentMCPActionResource.fetchById(
        auth,
        sandboxChildInfo.parentActionId
      )
    : null;
  const toolCallRow =
    ownToolCallRow ??
    (parentAction
      ? await AgentMessageConsumptionItemResource.fetchConsumptionToolCallRow(
          auth,
          {
            agentMCPActionModelId: parentAction.id,
          }
        )
      : null);
  if (!toolCallRow) {
    return;
  }

  const existingDirectRow =
    await AgentMessageConsumptionItemResource.fetchConsumptionToolDirectRow(
      auth,
      {
        agentMCPActionModelId: action.id,
      }
    );
  if (existingDirectRow) {
    await signalAffectedExecutions(
      auth,
      new Set([existingDirectRow.runKey ?? context.runKey])
    );
    return;
  }

  let resultTokensCount = 0;
  if (!parentAction) {
    const [emittingUsage] = await RunResource.listRunUsagesByModelIds(auth, {
      runUsageModelIds: [toolCallRow.runUsageId],
    });
    if (!emittingUsage) {
      logger.warn(
        { workspaceId, actionId: action.sId },
        "[Consumption] Tool row has no emitting run usage."
      );
      return;
    }
    resultTokensCount = await measureResultFootprint(auth, {
      action,
      conversationModelId: toolCallRow.conversationId,
      usage: emittingUsage,
    });
  }
  const chargeMicro = await rateToolCharge(auth, {
    action,
    agentMessageId: context.agentMessageId,
    agentMessageModelId: context.agentMessageModelId,
  });
  const wasRecorded = await recordToolCompletionPosting(auth, {
    actionModelId: action.id,
    agentMessageModelId: context.agentMessageModelId,
    chargeAmountMicro: chargeMicro,
    conversationModelId: toolCallRow.conversationId,
    resultTokensCount,
    rootAgentMessageModelId: context.rootAgentMessageId,
    runKey: context.runKey,
    runUsageModelId: toolCallRow.runUsageId,
  });

  await signalAffectedExecutions(auth, new Set([context.runKey]));

  if (wasRecorded) {
    logger.info(
      {
        workspaceId,
        actionId: action.sId,
        runKey: context.runKey,
        chargeMicro,
        resultTokensCount,
      },
      "[Consumption] Recorded a tool completion posting."
    );
  }
}

/**
 * @cc [owner:id13,label:backend;data-integrity] atomic-tool-completion-posting
 * The direct-charge posting and its outbox event MUST commit atomically. A duplicate posting MUST
 * append no event and MUST leave the existing posting unchanged.
 *
 * ```text
 * BEGIN
 *   insert tool_direct ── duplicate ──► no-op
 *          │
 *          └── inserted ──────────────► append items_changed
 * COMMIT
 * ```
 */
async function recordToolCompletionPosting(
  auth: Authenticator,
  {
    actionModelId,
    agentMessageModelId,
    chargeAmountMicro,
    conversationModelId,
    resultTokensCount,
    rootAgentMessageModelId,
    runKey,
    runUsageModelId,
  }: {
    actionModelId: ModelId;
    agentMessageModelId: ModelId;
    chargeAmountMicro: number;
    conversationModelId: ModelId;
    resultTokensCount: number;
    rootAgentMessageModelId: ModelId;
    runKey: string;
    runUsageModelId: ModelId;
  }
): Promise<boolean> {
  return withTransaction(async (transaction) => {
    const insertedRow =
      await AgentMessageConsumptionItemResource.insertConsumptionToolDirectRow(
        auth,
        {
          agentMCPActionModelId: actionModelId,
          agentMessageModelId,
          chargeAmountMicro,
          conversationModelId,
          inputTokensCount: resultTokensCount,
          runKey,
          runUsageModelId,
          transaction,
        }
      );
    if (!insertedRow) {
      return false;
    }

    await appendToolCompletionEvent(auth, {
      actionModelId,
      agentMessageModelId,
      consumptionItemModelId: insertedRow.consumptionItemId,
      rootAgentMessageModelId,
      runKey,
      transaction,
    });
    return true;
  });
}

async function appendToolCompletionEvent(
  auth: Authenticator,
  {
    actionModelId,
    agentMessageModelId,
    consumptionItemModelId,
    rootAgentMessageModelId,
    runKey,
    transaction,
  }: {
    actionModelId: ModelId;
    agentMessageModelId: ModelId;
    consumptionItemModelId: ModelId;
    rootAgentMessageModelId: ModelId;
    runKey: string;
    transaction: Transaction;
  }
): Promise<void> {
  await AgentMessageConsumptionEventResource.append(auth, {
    event: {
      kind: "items_changed",
      idempotencyKey: `tool-completion:${actionModelId}:${runKey}`,
      runKey,
      rootAgentMessageModelId,
      agentMessageModelId,
      consumptionItemIds: [consumptionItemModelId],
    },
    transaction,
  });
}

/**
 * @cc [owner:id13,label:backend;reliability] signal-tool-completion-executions
 * Every supplied execution MUST be signaled after the posting transaction commits. A signal failure
 * MUST be surfaced so an activity retry can recover the persisted outbox event.
 *
 * ```text
 * committed outbox event ──► execution workflow
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
