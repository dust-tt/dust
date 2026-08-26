import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { appendConsumptionEvent } from "@app/lib/api/assistant/consumption/events";
import { computeGroupedModelCreditAmount } from "@app/lib/api/assistant/consumption/rounding";
import { INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/consumption/version";
import type { Authenticator } from "@app/lib/auth";
import {
  buildAgentMessageBillingPlan,
  isFreeOrigin,
} from "@app/lib/credits/agent_message_billing";
import {
  MICRO_CREDITS_PER_CREDIT,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { AgentMessageConsumptionItemType } from "@app/types/assistant/agent_message_consumption";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

const MODEL_CREDIT_POSTING_ITEM_TYPES: ReadonlySet<AgentMessageConsumptionItemType> =
  new Set(["input", "output", "reasoning", "tool_call", "tool_result"]);

export type ExecutionBill = {
  userMessageOrigin: UserMessageOrigin;
  eventCreditAmount: number;
  costCredits: number;
  runUsageModelIds: ModelId[];
  actionModelIds: ModelId[];
};

export async function billExecution(
  auth: Authenticator,
  {
    agentMessageId,
    rootAgentMessageId,
    runKey,
  }: {
    agentMessageId: string;
    rootAgentMessageId: string;
    runKey: string;
  }
): Promise<ExecutionBill | null> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });
  if (!creditContext) {
    logger.warn(
      { workspaceId, agentMessageId, runKey },
      "[Consumption] Agent message not found while billing an execution."
    );
    return null;
  }
  const { agentMessageModelId, triggeringUserMessageOrigin } = creditContext;

  const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessageModelId,
  ]);

  const bill = await withTransaction(async (transaction) => {
    const messageRows =
      await AgentMessageConsumptionItemResource.listConsumptionRowsByAgentMessage(
        auth,
        { agentMessageModelId, lockForUpdate: true, transaction }
      );
    const executionRows = messageRows.filter((row) => row.runKey === runKey);
    if (executionRows.length === 0) {
      return null;
    }

    const hasTrackableTool = await settleToolCharges(auth, {
      actions,
      contextOrigin: triggeringUserMessageOrigin,
      messageRows,
      runKey,
      transaction,
    });

    let settledRows =
      await AgentMessageConsumptionItemResource.listConsumptionRowsByRunKey(
        auth,
        {
          runKey,
          transaction,
        }
      );
    const existingRoundingRow = settledRows.find(
      (row) => row.itemType === "rounding"
    );
    if (existingRoundingRow) {
      return executionBillFromSettledRows(auth, {
        agentMessageModelId,
        settledRows,
        transaction,
        userMessageOrigin: triggeringUserMessageOrigin ?? "web",
      });
    }

    const modelPostingRows = settledRows.filter((row) =>
      MODEL_CREDIT_POSTING_ITEM_TYPES.has(row.itemType)
    );
    if (modelPostingRows.length === 0 && !hasTrackableTool) {
      return null;
    }
    const usages = await RunResource.listRunUsagesByModelIds(auth, {
      runUsageModelIds: [
        ...new Set(modelPostingRows.map((row) => row.runUsageId)),
      ],
      transaction,
    });
    const modelCreditAmount = isFreeOrigin(triggeringUserMessageOrigin)
      ? 0
      : computeGroupedModelCreditAmount({
          modelPostings: modelPostingRows.map((row) => {
            if (row.reconciledCreditAmountMicro === null) {
              throw new Error(
                `Model consumption item ${row.id} has no reconciled amount`
              );
            }
            return {
              consumptionItemId: row.id,
              runUsageModelId: row.runUsageId,
              creditAmountMicro: row.reconciledCreditAmountMicro,
            };
          }),
          usageGroups: usages,
        });

    if (isFreeOrigin(triggeringUserMessageOrigin)) {
      await AgentMessageConsumptionItemResource.addReconciledCreditAmounts(
        auth,
        {
          creditAmountMicroDeltaByConsumptionItemId: new Map(
            settledRows.flatMap((row) => {
              const amount = row.reconciledCreditAmountMicro ?? 0;
              if (
                row.itemType === "tool_direct" ||
                row.itemType === "tool_adjustment"
              ) {
                return [];
              }
              return amount === 0 ? [] : [[row.id, -amount] as const];
            })
          ),
          transaction,
        }
      );
      settledRows =
        await AgentMessageConsumptionItemResource.listConsumptionRowsByRunKey(
          auth,
          {
            runKey,
            transaction,
          }
        );
    }

    const toolCreditAmountMicro = sumCharges(settledRows);
    assertWholeCredits(toolCreditAmountMicro, "tool charges");
    const eventCreditAmount =
      modelCreditAmount + toolCreditAmountMicro / MICRO_CREDITS_PER_CREDIT;
    const creditAmountMicro = sumReconciled(settledRows);
    const roundingCreditAmountMicro =
      roundCreditsToMicroCredits(eventCreditAmount) - creditAmountMicro;
    if (roundingCreditAmountMicro < 0) {
      throw new Error("Consumption rounding cannot reduce an execution");
    }

    const lastRunUsageModelId = lastRunUsageModelIdOf(settledRows);
    if (lastRunUsageModelId === null) {
      return null;
    }
    const insertedRoundingRows =
      await AgentMessageConsumptionItemResource.insertConsumptionRows(auth, {
        conversationModelId: settledRows[0].conversationId,
        agentMessageModelId,
        runKey,
        modelRows: [
          {
            itemType: "rounding",
            runUsageModelId: lastRunUsageModelId,
            inputTokensCount: null,
            outputTokensCount: null,
            grossAttributedCreditAmountMicro: 0,
            reconciledCreditAmountMicro: roundingCreditAmountMicro,
          },
        ],
        toolCallRows: [],
        toolResultRows: [],
        transaction,
      });

    const [insertedRoundingRow] = insertedRoundingRows;
    if (!insertedRoundingRow) {
      throw new Error(`Execution ${runKey} already has a rounding item`);
    }

    await appendConsumptionEvent(
      auth,
      {
        kind: "items_changed",
        idempotencyKey: `execution:${runKey}:billed`,
        runKey,
        rootAgentMessageId,
        agentMessageModelId,
        consumptionItemIds: [
          ...settledRows.map((row) => row.id),
          insertedRoundingRow.consumptionItemId,
        ],
      },
      { transaction }
    );

    const costCreditAmountMicro =
      await AgentMessageConsumptionItemResource.sumConsumptionBilledCreditAmountMicro(
        auth,
        {
          agentMessageModelId,
          transaction,
        }
      );
    assertWholeCredits(costCreditAmountMicro, "settled message");

    return {
      userMessageOrigin: triggeringUserMessageOrigin ?? "web",
      eventCreditAmount,
      costCredits: costCreditAmountMicro / MICRO_CREDITS_PER_CREDIT,
      runUsageModelIds: modelRunUsageModelIdsOf(settledRows),
      actionModelIds: toolActionModelIdsOf(settledRows),
    };
  });

  if (!bill) {
    return null;
  }

  logger.info(
    {
      workspaceId,
      agentMessageId,
      runKey,
      attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
      eventCreditAmount: bill.eventCreditAmount,
      costCredits: bill.costCredits,
    },
    "[Consumption] Billed an execution."
  );

  return bill;
}

function sumReconciled(rows: AgentMessageConsumptionItemResource[]): number {
  return rows.reduce(
    (total, row) => total + (row.reconciledCreditAmountMicro ?? 0),
    0
  );
}

function sumCharges(rows: AgentMessageConsumptionItemResource[]): number {
  return rows.reduce(
    (total, row) => total + (row.directCreditAmountMicro ?? 0),
    0
  );
}

function lastRunUsageModelIdOf(
  rows: AgentMessageConsumptionItemResource[]
): ModelId | null {
  return rows.reduce<ModelId | null>(
    (last, row) =>
      last === null || row.runUsageId > last ? row.runUsageId : last,
    null
  );
}

function modelRunUsageModelIdsOf(
  rows: AgentMessageConsumptionItemResource[]
): ModelId[] {
  return [
    ...new Set(
      rows.flatMap((row) => (row.itemType === "input" ? [row.runUsageId] : []))
    ),
  ];
}

function toolActionModelIdsOf(
  rows: AgentMessageConsumptionItemResource[]
): ModelId[] {
  return [
    ...new Set(
      rows.flatMap((row) => (row.isToolItem() ? [row.agentMCPActionId] : []))
    ),
  ];
}

function assertWholeCredits(amountMicro: number, label: string): void {
  if (amountMicro % MICRO_CREDITS_PER_CREDIT !== 0) {
    throw new Error(`Consumption ${label} must be whole credits`);
  }
}

async function executionBillFromSettledRows(
  auth: Authenticator,
  {
    agentMessageModelId,
    settledRows,
    transaction,
    userMessageOrigin,
  }: {
    agentMessageModelId: ModelId;
    settledRows: AgentMessageConsumptionItemResource[];
    transaction: Parameters<
      typeof AgentMessageConsumptionItemResource.listConsumptionRowsByRunKey
    >[1]["transaction"];
    userMessageOrigin: UserMessageOrigin;
  }
): Promise<ExecutionBill> {
  const eventCreditAmountMicro = sumReconciled(settledRows);
  assertWholeCredits(eventCreditAmountMicro, "settled execution");
  const costCreditAmountMicro =
    await AgentMessageConsumptionItemResource.sumConsumptionBilledCreditAmountMicro(
      auth,
      { agentMessageModelId, transaction }
    );
  assertWholeCredits(costCreditAmountMicro, "settled message");

  return {
    userMessageOrigin,
    eventCreditAmount: eventCreditAmountMicro / MICRO_CREDITS_PER_CREDIT,
    costCredits: costCreditAmountMicro / MICRO_CREDITS_PER_CREDIT,
    runUsageModelIds: modelRunUsageModelIdsOf(settledRows),
    actionModelIds: toolActionModelIdsOf(settledRows),
  };
}

async function settleToolCharges(
  auth: Authenticator,
  {
    actions,
    contextOrigin,
    messageRows,
    runKey,
    transaction,
  }: {
    actions: AgentMCPActionResource[];
    contextOrigin: UserMessageOrigin | null;
    messageRows: AgentMessageConsumptionItemResource[];
    runKey: string;
    transaction: Parameters<
      typeof AgentMessageConsumptionItemResource.listConsumptionRowsByRunKey
    >[1]["transaction"];
  }
): Promise<boolean> {
  const directToolRowByActionModelId = new Map(
    messageRows.flatMap((row) =>
      row.itemType === "tool_direct" &&
      row.agentMCPActionId !== null &&
      row.directCreditAmountMicro !== null
        ? [[row.agentMCPActionId, row] as const]
        : []
    )
  );
  const chargedActions = actions.filter((action) =>
    directToolRowByActionModelId.has(action.id)
  );
  if (chargedActions.length === 0) {
    return false;
  }

  const billingPlan = buildAgentMessageBillingPlan({
    actions: chargedActions.map((action) => ({
      action,
      internalMCPServerName: action.metadata.internalMCPServerName,
      mcpServerId: action.metadata.mcpServerId ?? null,
      status: action.status,
      toolName: getToolNameFromFunctionCallName(action.functionCallName),
    })),
    contextOrigin,
    runUsages: [],
  });

  const adjustments: Parameters<
    typeof AgentMessageConsumptionItemResource.insertConsumptionToolAdjustmentRows
  >[1]["adjustments"] = [];
  let hasTrackableTool = false;
  for (const line of billingPlan.tools) {
    const row = directToolRowByActionModelId.get(line.action.action.id);
    if (!row || row.runKey !== runKey) {
      continue;
    }
    hasTrackableTool ||= line.billingDisposition !== "unbillable_status";
    const finalChargeAmountMicro = roundCreditsToMicroCredits(
      line.billedCredits
    );
    const provisionalChargeAmountMicro = row.directCreditAmountMicro ?? 0;
    adjustments.push({
      agentMCPActionModelId: line.action.action.id,
      agentMessageModelId: row.agentMessageId,
      amountMicro: finalChargeAmountMicro - provisionalChargeAmountMicro,
      conversationModelId: row.conversationId,
      runKey,
      runUsageModelId: row.runUsageId,
    });
  }

  await AgentMessageConsumptionItemResource.insertConsumptionToolAdjustmentRows(
    auth,
    {
      adjustments,
      transaction,
    }
  );
  return hasTrackableTool;
}
