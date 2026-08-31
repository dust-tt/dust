import { microCreditsToMicroUsd } from "@app/lib/api/assistant/consumption/keys";
import {
  readConsumptionRootRevision,
  readConsumptionRootTotals,
  seedConsumptionRootTotals,
} from "@app/lib/api/assistant/consumption/root_hash";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";

import { Op } from "sequelize";

const COST_WARNING_THRESHOLDS_USD = [10, 50, 100] as const;
const COST_THRESHOLD_CROSSED_METRIC = "agent_loop.cost_threshold_crossed";
const MICRO_USD_PER_USD = 1_000_000;
const COST_THRESHOLD_LOG_TIMEFRAME_SECONDS = 60 * 60 * 24 * 30;
export const AGENT_LOOP_COST_HARD_CAP_USD = 100;
const AGENT_LOOP_COST_HARD_CAP_MICRO_USD =
  AGENT_LOOP_COST_HARD_CAP_USD * MICRO_USD_PER_USD;
export const AGENT_LOOP_SUBAGENT_HARD_CAP = 512;

interface CostThresholdEventData {
  agentMessageId: string;
  conversationId: string;
  step: number;
}

export async function checkCostAndSubagentsThresholds({
  auth,
  isRootAgentMessage,
  eventData,
  useAgentMessageConsumption,
}: {
  auth: Authenticator;
  isRootAgentMessage: boolean;
  eventData: CostThresholdEventData;
  useAgentMessageConsumption: boolean;
}): Promise<{
  totalCostMicroUsd: number;
  hardCapExceeded: boolean;
  subagentLaunchCount: number;
  subagentHardCapExceeded: boolean;
}> {
  const workspace = auth.getNonNullableWorkspace();
  if (!isRootAgentMessage) {
    return {
      totalCostMicroUsd: 0,
      hardCapExceeded: false,
      subagentLaunchCount: 0,
      subagentHardCapExceeded: false,
    };
  }

  const { subagentLaunchCount, totalCostMicroUsd } = await readTreeSpend(auth, {
    rootAgentMessageId: eventData.agentMessageId,
    useAgentMessageConsumption,
  });

  if (totalCostMicroUsd > 0) {
    for (const thresholdUsd of COST_WARNING_THRESHOLDS_USD) {
      const thresholdMicroUsd = thresholdUsd * MICRO_USD_PER_USD;
      if (totalCostMicroUsd < thresholdMicroUsd) {
        continue;
      }

      const key = `agent_loop_cost_threshold_${workspace.sId}_${eventData.agentMessageId}_${thresholdUsd}`;
      // Avoid repetitive warning/metric emission at each step once a threshold is crossed.
      const remaining = await rateLimiter({
        key,
        maxPerTimeframe: 1,
        timeframeSeconds: COST_THRESHOLD_LOG_TIMEFRAME_SECONDS,
        logger,
      });

      if (remaining <= 0) {
        continue;
      }

      logger.warn(
        {
          agentMessageId: eventData.agentMessageId,
          conversationId: eventData.conversationId,
          step: eventData.step,
          thresholdUsd,
          totalCostMicroUsd,
          workspaceId: workspace.sId,
        },
        "Agent loop cost threshold crossed"
      );

      statsDMetrics.increment(COST_THRESHOLD_CROSSED_METRIC, 1, [
        `threshold_usd:${thresholdUsd}`,
        `workspace_id:${workspace.sId}`,
      ]);
    }
  }

  return {
    totalCostMicroUsd,
    hardCapExceeded: totalCostMicroUsd >= AGENT_LOOP_COST_HARD_CAP_MICRO_USD,
    subagentLaunchCount,
    subagentHardCapExceeded:
      subagentLaunchCount >= AGENT_LOOP_SUBAGENT_HARD_CAP,
  };
}

async function readTreeSpend(
  auth: Authenticator,
  {
    rootAgentMessageId,
    useAgentMessageConsumption,
  }: {
    rootAgentMessageId: string;
    useAgentMessageConsumption: boolean;
  }
): Promise<{ subagentLaunchCount: number; totalCostMicroUsd: number }> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  let expectedRootRevision = 0;

  if (useAgentMessageConsumption) {
    const totals = await readConsumptionRootTotals({
      workspaceId,
      rootAgentMessageId,
    });
    if (totals) {
      return {
        subagentLaunchCount: totals.subagentCount,
        totalCostMicroUsd: microCreditsToMicroUsd(
          totals.totalCreditAmountMicro
        ),
      };
    }
    expectedRootRevision = await readConsumptionRootRevision({
      workspaceId,
      rootAgentMessageId,
    });
  }

  const {
    agentMessageModelIds,
    descendantAgenticUserMessageCount,
    dustRunIds,
    subagentAgentMessageModelIds,
  } = await collectDescendantData(auth, { rootAgentMessageId });

  if (!useAgentMessageConsumption) {
    return {
      subagentLaunchCount: descendantAgenticUserMessageCount,
      totalCostMicroUsd: await getCumulativeCostMicroUsd(auth, { dustRunIds }),
    };
  }

  const executionCreditAmountMicroByRunKey =
    await AgentMessageConsumptionItemResource.sumConsumptionCreditAmountMicroByRunKeyForAgentMessages(
      auth,
      { agentMessageModelIds }
    );
  const totalCreditAmountMicro = [
    ...executionCreditAmountMicroByRunKey.values(),
  ].reduce((total, executionTotal) => total + executionTotal, 0);
  const subagentCount = subagentAgentMessageModelIds.length;
  const seeded = await seedConsumptionRootTotals({
    workspaceId,
    rootAgentMessageId,
    expectedRevision: expectedRootRevision,
    totals: {
      totalCreditAmountMicro,
      subagentCount,
    },
    executionCreditAmountMicroByRunKey,
    subagentAgentMessageIds: subagentAgentMessageModelIds,
  });
  if (!seeded) {
    const currentTotals = await readConsumptionRootTotals({
      workspaceId,
      rootAgentMessageId,
    });
    if (currentTotals) {
      return {
        subagentLaunchCount: currentTotals.subagentCount,
        totalCostMicroUsd: microCreditsToMicroUsd(
          currentTotals.totalCreditAmountMicro
        ),
      };
    }
    logger.warn(
      { workspaceId, rootAgentMessageId },
      "[Consumption] Root hash changed while it was being rebuilt."
    );
  }
  logger.info(
    {
      workspaceId,
      rootAgentMessageId,
      totalCreditAmountMicro,
      subagentCount,
    },
    "[Consumption] Recomputed a missing root hash from the rows."
  );

  return {
    subagentLaunchCount: subagentCount,
    totalCostMicroUsd: microCreditsToMicroUsd(totalCreditAmountMicro),
  };
}

async function getCumulativeCostMicroUsd(
  auth: Authenticator,
  { dustRunIds }: { dustRunIds: string[] }
): Promise<number> {
  if (dustRunIds.length === 0) {
    return 0;
  }

  const runResources = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const runUsages = await RunResource.listRunUsagesForRuns(auth, {
    runs: runResources,
  });

  return runUsages.reduce((acc, usage) => acc + usage.costMicroUsd, 0);
}

/**
 * Guardrail checks are cheap enough at step start:
 * - Executed only for root messages, once per step.
 * - Roughly ~3 queries per depth level (agent -> child user -> child agent).
 * - Most messages are depth 1 (about 1-2 indexed queries), almost all under depth 2 (~2-6).
 * - Queries fetch only IDs/runIds and rely on
 *   `user_messages_workspace_agentic_origin_idx` for fast descendant lookup.
 */
async function collectDescendantData(
  auth: Authenticator,
  { rootAgentMessageId }: { rootAgentMessageId: string }
): Promise<{
  agentMessageModelIds: ModelId[];
  dustRunIds: string[];
  descendantAgenticUserMessageCount: number;
  subagentAgentMessageModelIds: AgentMessageModel["id"][];
}> {
  const workspace = auth.getNonNullableWorkspace();
  const visitedAgentMessageIds = new Set<string>();
  const agentMessageModelIds = new Set<ModelId>();
  const subagentAgentMessageModelIds = new Set<AgentMessageModel["id"]>();
  const runIds = new Set<string>();
  const descendantAgenticUserMessageRowIds = new Set<number>();
  let frontierAgentMessageIds = [rootAgentMessageId];

  while (frontierAgentMessageIds.length > 0) {
    const currentFrontier = frontierAgentMessageIds.filter(
      (agentMessageId) => !visitedAgentMessageIds.has(agentMessageId)
    );

    if (currentFrontier.length === 0) {
      break;
    }

    const agentMessageRows = await MessageModel.findAll({
      attributes: ["sId"],
      where: {
        sId: {
          [Op.in]: currentFrontier,
        },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          attributes: ["id", "runIds"],
          required: true,
        },
      ],
    });

    for (const row of agentMessageRows) {
      visitedAgentMessageIds.add(row.sId);

      const agentMessage = row.agentMessage;
      if (!agentMessage) {
        continue;
      }

      agentMessageModelIds.add(agentMessage.id);
      if (row.sId !== rootAgentMessageId) {
        subagentAgentMessageModelIds.add(agentMessage.id);
      }
      for (const runId of agentMessage.runIds ?? []) {
        runIds.add(runId);
      }
    }

    const childUserMessageRows = await MessageModel.findAll({
      attributes: ["id"],
      where: {
        workspaceId: workspace.id,
      },
      include: [
        {
          model: UserMessageModel,
          as: "userMessage",
          attributes: [],
          required: true,
          where: {
            // Keep workspace filtering on the joined user_message table for explicit isolation
            // and to match the workspace-first descendant index.
            workspaceId: workspace.id,
            agenticOriginMessageId: {
              [Op.in]: currentFrontier,
            },
          },
        },
      ],
    });

    if (childUserMessageRows.length === 0) {
      break;
    }

    const childUserMessageRowIds = childUserMessageRows.map((row) => row.id);
    for (const rowId of childUserMessageRowIds) {
      descendantAgenticUserMessageRowIds.add(rowId);
    }

    const childAgentMessageRows = await MessageModel.findAll({
      attributes: ["sId"],
      where: {
        parentId: {
          [Op.in]: childUserMessageRowIds,
        },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMessageModel,
          as: "agentMessage",
          attributes: [],
          required: true,
        },
      ],
    });

    frontierAgentMessageIds = childAgentMessageRows.map((row) => row.sId);
  }

  return {
    agentMessageModelIds: [...agentMessageModelIds],
    dustRunIds: [...runIds],
    descendantAgenticUserMessageCount: descendantAgenticUserMessageRowIds.size,
    subagentAgentMessageModelIds: [...subagentAgentMessageModelIds],
  };
}
