import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { RunResource } from "@app/lib/resources/run_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";

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
}: {
  auth: Authenticator;
  isRootAgentMessage: boolean;
  eventData: CostThresholdEventData;
}): Promise<{
  totalCostMicroUsd: number;
  // The root message's own cost (excluding subagent descendants), for callers that need a
  // per-message figure without re-querying `RunResource` themselves.
  ownCostMicroUsd: number | null;
  hardCapExceeded: boolean;
  subagentLaunchCount: number;
  subagentHardCapExceeded: boolean;
}> {
  const workspace = auth.getNonNullableWorkspace();
  if (!isRootAgentMessage) {
    return {
      totalCostMicroUsd: 0,
      ownCostMicroUsd: null,
      hardCapExceeded: false,
      subagentLaunchCount: 0,
      subagentHardCapExceeded: false,
    };
  }

  const { dustRunIds, ownDustRunIds, descendantAgenticUserMessageCount } =
    await collectDescendantData(auth, {
      rootAgentMessageId: eventData.agentMessageId,
    });

  const { totalCostMicroUsd, ownCostMicroUsd } = await getCostBreakdownMicroUsd(
    auth,
    { dustRunIds, ownDustRunIds }
  );

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
    ownCostMicroUsd,
    hardCapExceeded: totalCostMicroUsd >= AGENT_LOOP_COST_HARD_CAP_MICRO_USD,
    subagentLaunchCount: descendantAgenticUserMessageCount,
    subagentHardCapExceeded:
      descendantAgenticUserMessageCount >= AGENT_LOOP_SUBAGENT_HARD_CAP,
  };
}

// Computes total cost (root + subagent descendants) and the root's own cost in a single query
// pass, so callers that need both don't have to fetch `RunResource`/`RunUsage` data twice.
async function getCostBreakdownMicroUsd(
  auth: Authenticator,
  {
    dustRunIds,
    ownDustRunIds,
  }: { dustRunIds: string[]; ownDustRunIds: string[] }
): Promise<{ totalCostMicroUsd: number; ownCostMicroUsd: number }> {
  if (dustRunIds.length === 0) {
    return { totalCostMicroUsd: 0, ownCostMicroUsd: 0 };
  }

  const runResources = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const runUsages = await RunResource.listRunUsagesForRuns(auth, {
    runs: runResources,
  });

  const ownDustRunIdSet = new Set(ownDustRunIds);
  const ownRunModelIds = new Set(
    runResources
      .filter((run) => ownDustRunIdSet.has(run.dustRunId))
      .map((run) => run.id)
  );

  let totalCostMicroUsd = 0;
  let ownCostMicroUsd = 0;
  for (const usage of runUsages) {
    totalCostMicroUsd += usage.costMicroUsd;
    if (ownRunModelIds.has(usage.runModelId)) {
      ownCostMicroUsd += usage.costMicroUsd;
    }
  }

  return { totalCostMicroUsd, ownCostMicroUsd };
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
  dustRunIds: string[];
  // The root message's own runIds, a subset of dustRunIds. Captured for free from the first BFS
  // level, so callers needing a per-message cost breakdown don't need their own extra query.
  ownDustRunIds: string[];
  descendantAgenticUserMessageCount: number;
}> {
  const workspace = auth.getNonNullableWorkspace();
  const visitedAgentMessageIds = new Set<string>();
  const runIds = new Set<string>();
  let ownDustRunIds: string[] = [];
  const descendantAgenticUserMessageRowIds = new Set<number>();
  let frontierAgentMessageIds = [rootAgentMessageId];
  let isRootLevel = true;

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
          attributes: ["runIds"],
          required: true,
        },
      ],
    });

    for (const row of agentMessageRows) {
      visitedAgentMessageIds.add(row.sId);

      const agentMessage = row.agentMessage;
      if (!agentMessage?.runIds) {
        continue;
      }

      for (const runId of agentMessage.runIds) {
        runIds.add(runId);
      }
    }

    if (isRootLevel) {
      ownDustRunIds = [...runIds];
      isRootLevel = false;
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
    dustRunIds: [...runIds],
    ownDustRunIds,
    descendantAgenticUserMessageCount: descendantAgenticUserMessageRowIds.size,
  };
}
