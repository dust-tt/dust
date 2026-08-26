import { isToolExecutionStatusBillable } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { measureToolCallFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getAttachmentCapabilityContext } from "@app/lib/api/assistant/conversation/attachment_capabilities";
import type { Authenticator } from "@app/lib/auth";
import {
  getMCPServerBillingKey,
  getToolBillingInfo,
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
import { signalConsumptionEventsAppended } from "@app/temporal/consumption/client";
import { isTerminalAgentMessageStatus } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

export async function recordToolCompletionConsumption(
  auth: Authenticator,
  {
    context,
    action,
  }: {
    context: ToolCompletionConsumptionContext;
    action: AgentMCPActionResource;
  },
): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const ownToolCallRow =
    await AgentMessageConsumptionItemResource.fetchConsumptionToolCallRow(
      auth,
      {
        agentMCPActionModelId: action.id,
      },
    );
  const sandboxChildInfo = action.stepContext.sandboxChildActionInfo;
  const parentAction = isSandboxChildActionInfo(sandboxChildInfo)
    ? await AgentMCPActionResource.fetchById(
        auth,
        sandboxChildInfo.parentActionId,
      )
    : null;
  const toolCallRow =
    ownToolCallRow ??
    (parentAction
      ? await AgentMessageConsumptionItemResource.fetchConsumptionToolCallRow(
          auth,
          {
            agentMCPActionModelId: parentAction.id,
          },
        )
      : null);
  if (!toolCallRow) {
    logger.warn(
      { workspaceId, actionId: action.sId },
      "Tool completion has no consumption call posting",
    );
    return new Err(
      new Error(`Tool action ${action.sId} has no consumption call posting`),
    );
  }

  const existingDirectRow =
    await AgentMessageConsumptionItemResource.fetchConsumptionToolDirectRow(
      auth,
      {
        agentMCPActionModelId: action.id,
      },
    );
  if (existingDirectRow) {
    if (existingDirectRow.runKey) {
      await signalAffectedExecutions(auth, [existingDirectRow.runKey]);
    }
    return new Ok(undefined);
  }

  let resultTokensCount = 0;
  if (!parentAction) {
    const [emittingUsage] = await RunResource.listRunUsagesByModelIds(auth, {
      runUsageModelIds: [toolCallRow.runUsageId],
    });
    if (!emittingUsage) {
      logger.warn(
        { workspaceId, actionId: action.sId },
        "[Consumption] Tool row has no emitting run usage.",
      );
      return new Err(
        new Error(`Tool action ${action.sId} has no emitting run usage`),
      );
    }
    const resultFootprintRes = await measureResultFootprint(auth, {
      action,
      conversationModelId: toolCallRow.conversationId,
      usage: emittingUsage,
    });
    if (resultFootprintRes.isErr()) {
      return resultFootprintRes;
    }
    resultTokensCount = resultFootprintRes.value;
  }
  const chargeMicro = await rateToolCharge(auth, {
    action,
    agentMessageId: context.agentMessageId,
    agentMessageModelId: context.agentMessageModelId,
  });
  const settlement = await withTransaction(async (transaction) => {
    const insertedRow =
      await AgentMessageConsumptionItemResource.insertConsumptionToolDirectRow(
        auth,
        {
          agentMCPActionModelId: action.id,
          agentMessageModelId: context.agentMessageModelId,
          chargeAmountMicro: chargeMicro,
          conversationModelId: toolCallRow.conversationId,
          inputTokensCount: resultTokensCount,
          runKey: context.runKey,
          runUsageModelId: toolCallRow.runUsageId,
          transaction,
        },
      );
    if (!insertedRow) {
      return null;
    }

    await AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "items_changed",
        idempotencyKey: `tool-completion:${action.id}:${context.runKey}`,
        runKey: context.runKey,
        rootAgentMessageId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionItemIds: [insertedRow.consumptionItemId],
      },
      transaction,
    });
    return { chargeMicro };
  });

  if (settlement) {
    logger.info(
      {
        workspaceId,
        actionId: action.sId,
        runKey: context.runKey,
        chargeMicro: settlement.chargeMicro,
        resultTokensCount,
      },
      "[Consumption] Recorded a tool completion posting.",
    );
  }
  await signalAffectedExecutions(auth, [context.runKey]);
  return new Ok(undefined);
}

async function signalAffectedExecutions(
  auth: Authenticator,
  runKeys: string[],
): Promise<void> {
  for (const runKey of new Set(runKeys)) {
    await signalConsumptionEventsAppended(auth.toJSON(), {
      runKey,
    });
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
  },
): Promise<number> {
  if (!isToolExecutionStatusBillable(action.status)) {
    return 0;
  }

  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });
  if (!creditContext || isTerminalAgentMessageStatus(creditContext.status)) {
    return 0;
  }

  const billingAction = billingActionOf(action);
  const { toolCostCategory, freeUsage } = getToolBillingInfo(
    billingAction.internalMCPServerName,
    billingAction.toolName,
  );
  if (freeUsage) {
    return 0;
  }

  const ratedCreditAmountMicro = roundCreditsToMicroCredits(
    TOOL_COST_CATEGORY_AWU_WEIGHTS[toolCostCategory],
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
  },
): Promise<number> {
  const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessageModelId,
  ]);
  const chargedRows =
    await AgentMessageConsumptionItemResource.listConsumptionChargedToolRows(
      auth,
      {
        agentMessageModelId,
      },
    );
  const actionModelIdsOfServer = new Set(
    actions
      .filter(
        (candidate) =>
          getMCPServerBillingKey(billingActionOf(candidate)) ===
          mcpServerBillingKey,
      )
      .map((candidate) => candidate.id),
  );

  return chargedRows.reduce(
    (total, row) =>
      actionModelIdsOfServer.has(row.agentMCPActionId)
        ? total + (row.directCreditAmountMicro ?? 0)
        : total,
    0,
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
  },
): Promise<Result<number, Error>> {
  const [conversation] = await ConversationResource.fetchByModelIds(
    auth,
    [conversationModelId],
    { includeDeleted: true },
  );
  if (!conversation) {
    return new Err(
      new Error(
        `Conversation ${conversationModelId} not found while measuring a tool result`,
      ),
    );
  }
  const capabilities = await getAttachmentCapabilityContext(auth, conversation);

  const [enrichedAction] =
    await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
      actions: [action],
      ignoreContent: false,
    });
  if (!enrichedAction) {
    return new Ok(0);
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
    return footprintsRes;
  }
  return new Ok(footprintsRes.value[0]?.inputTokensCount ?? 0);
}
