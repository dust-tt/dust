import { isToolExecutionStatusBillable } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { creditsForInputTokens } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { measureToolCallFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { appendConsumptionEvent } from "@app/lib/api/assistant/consumption/events";
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
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/consumption/client";
import { isTerminalAgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

type ToolCompletionConsumptionContext = {
  agentMessageId: string;
  agentMessageModelId: ModelId;
  rootAgentMessageId: string;
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
  const settlement = await withTransaction(async (transaction) => {
    const returnedCallCreditAmountMicro =
      emittingRunKey === context.runKey
        ? 0
        : (toolRow.reconciledCreditAmountMicro ?? 0);

    const settled =
      await AgentMessageConsumptionItemResource.completeConsumptionToolRow(
        auth,
        {
          consumptionItemId: toolRow.id,
          runKey: context.runKey,
          inputTokensCount: resultTokensCount,
          grossCreditAmountMicroDelta: resultCreditAmountMicro + chargeMicro,
          reconciledCreditAmountMicroDelta:
            chargeMicro - returnedCallCreditAmountMicro,
          directCreditAmountMicro: chargeMicro,
          transaction,
        }
      );
    if (!settled) {
      return null;
    }

    const movedExecutions = emittingRunKey !== context.runKey;
    const emittingItemModelIds = [toolRow.id];

    if (returnedCallCreditAmountMicro > 0) {
      const emittingOutputRow =
        await AgentMessageConsumptionItemResource.fetchConsumptionModelRow(
          auth,
          {
            runUsageModelId: toolRow.runUsageId,
            itemType: "output",
            transaction,
          }
        );
      if (!emittingOutputRow) {
        throw new Error(
          `Cannot return tool call credit without output row for run usage ${toolRow.runUsageId}`
        );
      }
      await AgentMessageConsumptionItemResource.addReconciledCreditAmounts(
        auth,
        {
          creditAmountMicroDeltaByConsumptionItemId: new Map([
            [emittingOutputRow.id, returnedCallCreditAmountMicro],
          ]),
          transaction,
        }
      );
      emittingItemModelIds.push(emittingOutputRow.id);
    }

    await appendConsumptionEvent(
      auth,
      {
        kind: "items_changed",
        idempotencyKey: `tool-completion:${action.id}:${context.runKey}`,
        runKey: context.runKey,
        rootAgentMessageId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionItemIds: [toolRow.id],
      },
      { transaction }
    );

    if (movedExecutions) {
      await appendConsumptionEvent(
        auth,
        {
          kind: "items_changed",
          idempotencyKey: `tool-compensation:${action.id}:${emittingRunKey}`,
          runKey: emittingRunKey,
          rootAgentMessageId: context.rootAgentMessageId,
          agentMessageModelId: context.agentMessageModelId,
          consumptionItemIds: emittingItemModelIds,
        },
        { transaction }
      );
    }

    return { chargeMicro, returnedCallCreditAmountMicro };
  });

  await signalAffectedExecutions(auth, affectedRunKeys);

  if (settlement) {
    logger.info(
      {
        workspaceId,
        actionId: action.sId,
        runKey: context.runKey,
        chargeMicro: settlement.chargeMicro,
        returnedCallCreditAmountMicro: settlement.returnedCallCreditAmountMicro,
        resultTokensCount,
      },
      "[Consumption] Settled a tool row."
    );
  }
}

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
