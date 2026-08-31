import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { isToolExecutionStatus } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { creditAmountMicroFromCostMicroUsd } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/consumption/version";
import { FREE_ORIGINS } from "@app/lib/credits/agent_message_billing";
import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import { buildUsageEvents, getUsageType } from "@app/lib/metronome/events";
import { getFrontReplicaDbConnection } from "@app/lib/production_checks/utils";
import { isModelId } from "@app/types/assistant/models/models";
import { isModelProviderId } from "@app/types/assistant/models/providers";
import type { CheckFunction } from "@app/types/production_checks";
import { QueryTypes } from "sequelize";

const LOOKBACK_HOURS = 24;
const MAX_CHECKED_EXECUTIONS = 10_000;
const MAX_REPORTED_DIFFS = 20;

type Numeric = number | string;

type ConsumptionExecutionRow = {
  workspaceId: string;
  agentMessageId: string;
  runKey: string;
  isFree: boolean;
  consumptionEventMicro: Numeric;
  consumptionModelMicro: Numeric;
};

type RunUsageRow = {
  workspaceId: string;
  agentMessageId: string;
  runKey: string;
  providerId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number | null;
  cachedTokens: number | null;
  cacheCreationTokens: number | null;
  costMicroUsd: Numeric;
  isBatch: boolean;
};

type ActionRow = {
  workspaceId: string;
  agentMessageId: string;
  runKey: string | null;
  status: string;
  originalToolName: string | null;
  functionCallName: string | null;
  toolServerId: string | null;
  executionDurationMs: number | null;
};

type MessageCostRow = {
  workspaceId: string;
  agentMessageId: string;
  costCredits: number | null;
  consumptionMicro: Numeric;
};

type ExecutionDiff = {
  workspaceId: string;
  agentMessageId: string;
  runKey: string;
  consumptionModelMicro: number;
  oracleModelMicro: number;
  consumptionEventCredits: number;
  oracleEventCredits: number | null;
};

type MessageDiff = {
  workspaceId: string;
  agentMessageId: string;
  costCredits: number | null;
  consumptionCredits: number;
};

function executionKey({
  workspaceId,
  agentMessageId,
  runKey,
}: {
  workspaceId: string;
  agentMessageId: string;
  runKey: string;
}): string {
  return JSON.stringify([workspaceId, agentMessageId, runKey]);
}

function messageKey({
  workspaceId,
  agentMessageId,
}: {
  workspaceId: string;
  agentMessageId: string;
}): string {
  return JSON.stringify([workspaceId, agentMessageId]);
}

function nonNegativeSafeInteger(value: Numeric, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} is outside the supported integer range`);
  }
  return parsed;
}

export const checkConsumptionAgreesWithBilling: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const frontDb = getFrontReplicaDbConnection();
  const since = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000
  ).toISOString();
  const replacements = {
    attributionVersion: INCREMENTAL_CONSUMPTION_ATTRIBUTION_VERSION,
    freeOrigins: [...FREE_ORIGINS],
    queryExecutionLimit: MAX_CHECKED_EXECUTIONS + 1,
    since,
  };

  const executionRows: ConsumptionExecutionRow[] =
    // biome-ignore lint/plugin/noRawSql: Production check using read replica
    await frontDb.query(
      `
      WITH target_execution AS (
        SELECT "workspaceId", "agentMessageId", "runKey"
        FROM agent_message_consumption_items
        WHERE "attributionVersion" = :attributionVersion
          AND "itemType" = 'rounding'
          AND "createdAt" >= :since
        ORDER BY "createdAt" DESC, id DESC
        LIMIT :queryExecutionLimit
      )
      SELECT
        w."sId" AS "workspaceId",
        message."sId" AS "agentMessageId",
        target."runKey",
        COALESCE(
          user_message."userContextOrigin" IN (:freeOrigins),
          FALSE
        ) AS "isFree",
        SUM(item."reconciledCreditAmountMicro") AS "consumptionEventMicro",
        SUM(item."reconciledCreditAmountMicro")
          - SUM(COALESCE(item."directCreditAmountMicro", 0))
          - SUM(
            CASE WHEN item."itemType" = 'rounding'
              THEN item."reconciledCreditAmountMicro" ELSE 0 END
          ) AS "consumptionModelMicro"
      FROM target_execution target
      JOIN agent_message_consumption_items item
        ON item."workspaceId" = target."workspaceId"
        AND item."agentMessageId" = target."agentMessageId"
        AND item."runKey" = target."runKey"
        AND item."attributionVersion" = :attributionVersion
      JOIN workspaces w ON w.id = target."workspaceId"
      JOIN messages message
        ON message."workspaceId" = target."workspaceId"
        AND message."agentMessageId" = target."agentMessageId"
      LEFT JOIN messages parent_message
        ON parent_message.id = message."parentId"
        AND parent_message."workspaceId" = message."workspaceId"
      LEFT JOIN user_messages user_message
        ON user_message.id = parent_message."userMessageId"
        AND user_message."workspaceId" = parent_message."workspaceId"
      GROUP BY 1, 2, 3, 4
      `,
      { type: QueryTypes.SELECT, replacements }
    );

  const usageRows: RunUsageRow[] =
    // biome-ignore lint/plugin/noRawSql: Production check using read replica
    await frontDb.query(
      `
      WITH target_execution AS (
        SELECT "workspaceId", "agentMessageId", "runKey"
        FROM agent_message_consumption_items
        WHERE "attributionVersion" = :attributionVersion
          AND "itemType" = 'rounding'
          AND "createdAt" >= :since
        ORDER BY "createdAt" DESC, id DESC
        LIMIT :queryExecutionLimit
      )
      SELECT
        w."sId" AS "workspaceId",
        message."sId" AS "agentMessageId",
        target."runKey",
        usage."providerId",
        usage."modelId",
        usage."promptTokens",
        usage."completionTokens",
        usage."reasoningTokens",
        usage."cachedTokens",
        usage."cacheCreationTokens",
        usage."costMicroUsd",
        usage."isBatch"
      FROM target_execution target
      JOIN agent_message_consumption_items input_item
        ON input_item."workspaceId" = target."workspaceId"
        AND input_item."agentMessageId" = target."agentMessageId"
        AND input_item."runKey" = target."runKey"
        AND input_item."attributionVersion" = :attributionVersion
        AND input_item."itemType" = 'input'
      JOIN run_usages usage
        ON usage.id = input_item."runUsageId"
        AND usage."workspaceId" = input_item."workspaceId"
      JOIN workspaces w ON w.id = target."workspaceId"
      JOIN messages message
        ON message."workspaceId" = target."workspaceId"
        AND message."agentMessageId" = target."agentMessageId"
      `,
      { type: QueryTypes.SELECT, replacements }
    );

  const actionRows: ActionRow[] =
    // biome-ignore lint/plugin/noRawSql: Production check using read replica
    await frontDb.query(
      `
      WITH target_execution AS (
        SELECT "workspaceId", "agentMessageId", "runKey"
        FROM agent_message_consumption_items
        WHERE "attributionVersion" = :attributionVersion
          AND "itemType" = 'rounding'
          AND "createdAt" >= :since
        ORDER BY "createdAt" DESC, id DESC
        LIMIT :queryExecutionLimit
      ),
      target_message AS (
        SELECT DISTINCT "workspaceId", "agentMessageId"
        FROM target_execution
      )
      SELECT
        w."sId" AS "workspaceId",
        message."sId" AS "agentMessageId",
        tool_item."runKey",
        action.status,
        action."toolConfiguration"->>'originalName' AS "originalToolName",
        step_content.value->'value'->>'name' AS "functionCallName",
        action."toolConfiguration"->>'toolServerId' AS "toolServerId",
        action."executionDurationMs"
      FROM target_message target
      JOIN agent_mcp_actions action
        ON action."workspaceId" = target."workspaceId"
        AND action."agentMessageId" = target."agentMessageId"
      JOIN agent_step_contents step_content
        ON step_content.id = action."stepContentId"
        AND step_content."workspaceId" = action."workspaceId"
      LEFT JOIN agent_message_consumption_items tool_item
        ON tool_item."workspaceId" = action."workspaceId"
        AND tool_item."agentMCPActionId" = action.id
        AND tool_item."attributionVersion" = :attributionVersion
        AND tool_item."itemType" = 'tool_direct'
      JOIN workspaces w ON w.id = target."workspaceId"
      JOIN messages message
        ON message."workspaceId" = target."workspaceId"
        AND message."agentMessageId" = target."agentMessageId"
      ORDER BY action.id
      `,
      { type: QueryTypes.SELECT, replacements }
    );

  const usagesByExecution = new Map<string, RunUsageRow[]>();
  for (const usage of usageRows) {
    const key = executionKey(usage);
    usagesByExecution.set(key, [...(usagesByExecution.get(key) ?? []), usage]);
  }
  const actionsByMessage = new Map<string, ActionRow[]>();
  for (const action of actionRows) {
    const key = messageKey(action);
    actionsByMessage.set(key, [...(actionsByMessage.get(key) ?? []), action]);
  }

  const executionDiffs: ExecutionDiff[] = [];
  for (const row of executionRows) {
    const usages = usagesByExecution.get(executionKey(row)) ?? [];
    const oracleModelMicro = usages.reduce(
      (total, usage) =>
        total +
        creditAmountMicroFromCostMicroUsd(
          nonNegativeSafeInteger(usage.costMicroUsd, "Provider cost")
        ),
      0
    );
    const origin = row.isFree ? "agent_sidekick" : "web";
    const runUsages = usages.map((usage) => {
      if (!isModelId(usage.modelId)) {
        throw new Error(`Unknown model id: ${usage.modelId}`);
      }
      if (!isModelProviderId(usage.providerId)) {
        throw new Error(`Unknown model provider id: ${usage.providerId}`);
      }
      return {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        reasoningTokens: usage.reasoningTokens,
        cachedTokens: usage.cachedTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
        costMicroUsd: nonNegativeSafeInteger(
          usage.costMicroUsd,
          "Provider cost"
        ),
        isBatch: usage.isBatch,
        modelId: usage.modelId,
        providerId: usage.providerId,
      };
    });
    const actions = (actionsByMessage.get(messageKey(row)) ?? []).map(
      (action) => {
        if (!isToolExecutionStatus(action.status)) {
          throw new Error(`Unknown tool execution status: ${action.status}`);
        }
        const functionCallName = action.functionCallName;
        if (!action.originalToolName && !functionCallName) {
          throw new Error("Tool action has no persisted name");
        }
        return {
          toolName:
            action.originalToolName ??
            getToolNameFromFunctionCallName(functionCallName ?? ""),
          mcpServerId: action.toolServerId,
          internalMCPServerName: getInternalMCPServerNameFromSId(
            action.toolServerId
          ),
          status: action.status,
          executionDurationMs: action.executionDurationMs,
          shouldEmit: action.runKey === row.runKey,
        };
      }
    );
    const events = buildUsageEvents({
      workspaceId: row.workspaceId,
      isByok: false,
      conversationId: "parity-check",
      userId: null,
      isFreeSeatedUser: false,
      agentMessageId: row.agentMessageId,
      agentId: null,
      subAgentId: null,
      parentAgentMessageId: null,
      runKey: row.runKey,
      runUsages,
      actions,
      origin,
      usageType: getUsageType(false, origin),
      authMethod: null,
      apiKeyName: null,
      messageStatus: "succeeded",
      isSubAgentMessage: false,
      timestamp: since,
    });
    const costAwu = events[0]?.properties.cost_awu;
    const oracleEventCredits =
      events.length === 1 && typeof costAwu === "number" ? costAwu : null;
    const consumptionEventMicro = nonNegativeSafeInteger(
      row.consumptionEventMicro,
      "Consumption event total"
    );
    const consumptionModelMicro = nonNegativeSafeInteger(
      row.consumptionModelMicro,
      "Consumption model total"
    );
    const consumptionEventCredits =
      consumptionEventMicro / MICRO_CREDITS_PER_CREDIT;
    const expectedModelMicro = row.isFree ? 0 : oracleModelMicro;

    if (
      consumptionModelMicro !== expectedModelMicro ||
      consumptionEventCredits !== oracleEventCredits
    ) {
      executionDiffs.push({
        workspaceId: row.workspaceId,
        agentMessageId: row.agentMessageId,
        runKey: row.runKey,
        consumptionModelMicro,
        oracleModelMicro: expectedModelMicro,
        consumptionEventCredits,
        oracleEventCredits,
      });
    }
  }

  const messageRows: MessageCostRow[] =
    // biome-ignore lint/plugin/noRawSql: Production check using read replica
    await frontDb.query(
      `
      WITH target_execution AS (
        SELECT "workspaceId", "agentMessageId", "runKey"
        FROM agent_message_consumption_items
        WHERE "attributionVersion" = :attributionVersion
          AND "itemType" = 'rounding'
          AND "createdAt" >= :since
        ORDER BY "createdAt" DESC, id DESC
        LIMIT :queryExecutionLimit
      ),
      target_message AS (
        SELECT DISTINCT "workspaceId", "agentMessageId"
        FROM target_execution
      ),
      billed_execution AS (
        SELECT DISTINCT item."workspaceId", item."agentMessageId", item."runKey"
        FROM agent_message_consumption_items item
        JOIN target_message target
          ON target."workspaceId" = item."workspaceId"
          AND target."agentMessageId" = item."agentMessageId"
        WHERE item."attributionVersion" = :attributionVersion
          AND item."itemType" = 'rounding'
      )
      SELECT
        w."sId" AS "workspaceId",
        message."sId" AS "agentMessageId",
        agent_message."costCredits",
        SUM(item."reconciledCreditAmountMicro") AS "consumptionMicro"
      FROM billed_execution billed
      JOIN agent_message_consumption_items item
        ON item."workspaceId" = billed."workspaceId"
        AND item."agentMessageId" = billed."agentMessageId"
        AND item."runKey" = billed."runKey"
        AND item."attributionVersion" = :attributionVersion
      JOIN agent_messages agent_message
        ON agent_message.id = billed."agentMessageId"
        AND agent_message."workspaceId" = billed."workspaceId"
      JOIN messages message
        ON message."agentMessageId" = billed."agentMessageId"
        AND message."workspaceId" = billed."workspaceId"
      JOIN workspaces w ON w.id = billed."workspaceId"
      GROUP BY 1, 2, 3
      `,
      { type: QueryTypes.SELECT, replacements }
    );

  const messageDiffs: MessageDiff[] = [];
  for (const row of messageRows) {
    const consumptionCredits =
      nonNegativeSafeInteger(
        row.consumptionMicro,
        "Message consumption total"
      ) / MICRO_CREDITS_PER_CREDIT;
    if (row.costCredits !== consumptionCredits) {
      messageDiffs.push({
        workspaceId: row.workspaceId,
        agentMessageId: row.agentMessageId,
        costCredits: row.costCredits,
        consumptionCredits,
      });
    }
  }

  const checkedExecutions = executionRows.length;
  const checkedMessages = messageRows.length;
  const isSaturated = checkedExecutions > MAX_CHECKED_EXECUTIONS;
  if (
    !isSaturated &&
    executionDiffs.length === 0 &&
    messageDiffs.length === 0
  ) {
    logger.info(
      { checkedExecutions, checkedMessages },
      "Consumption agrees with billing"
    );
    reportSuccess({ checkedExecutions, checkedMessages });
    return;
  }

  reportFailure(
    {
      actionLinks: [],
      checkedExecutions,
      checkedMessages,
      executionDiffCount: executionDiffs.length,
      isSaturated,
      messageDiffCount: messageDiffs.length,
      executionDiffs: executionDiffs.slice(0, MAX_REPORTED_DIFFS),
      messageDiffs: messageDiffs.slice(0, MAX_REPORTED_DIFFS),
    },
    isSaturated
      ? `Consumption check exceeded its ${MAX_CHECKED_EXECUTIONS}-execution bound`
      : `Consumption disagrees with billing on ${executionDiffs.length} execution(s) and ${messageDiffs.length} message(s)`
  );
};
