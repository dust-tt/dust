import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { Op } from "sequelize";

const COST_WARNING_THRESHOLDS_USD = [10, 50, 100] as const;
const COST_THRESHOLD_CROSSED_METRIC = "agent_loop.cost_threshold_crossed";
const MICRO_USD_PER_USD = 1_000_000;
const COST_THRESHOLD_LOG_TIMEFRAME_SECONDS = 60 * 60 * 24 * 30;

interface CostThresholdEventData {
  agentMessageId: string;
  conversationId: string;
  step: number;
}

export async function logAgentLoopCostThresholdWarnings({
  auth,
  isRootAgentMessage,
  eventData,
}: {
  auth: Authenticator;
  isRootAgentMessage: boolean;
  eventData: CostThresholdEventData;
}): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();
  if (!isRootAgentMessage) {
    return;
  }

  const totalCostMicroUsd = await getCumulativeCostMicroUsd(auth, {
    rootAgentMessageId: eventData.agentMessageId,
  });

  if (totalCostMicroUsd <= 0) {
    return;
  }

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

    statsDClient.increment(COST_THRESHOLD_CROSSED_METRIC, 1, [
      `threshold_usd:${thresholdUsd}`,
      `workspace_id:${workspace.sId}`,
    ]);
  }
}

async function getCumulativeCostMicroUsd(
  auth: Authenticator,
  { rootAgentMessageId }: { rootAgentMessageId: string }
): Promise<number> {
  const dustRunIds = await collectDescendantRunIds(auth, {
    rootAgentMessageId,
  });

  if (dustRunIds.length === 0) {
    return 0;
  }

  const runResources = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const runUsages = await concurrentExecutor(
    runResources,
    async (runResource) => runResource.listRunUsages(auth),
    { concurrency: 5 }
  );

  return runUsages.flat().reduce((acc, usage) => acc + usage.costMicroUsd, 0);
}

/**
 * Cost checks are cheap enough at step start:
 * - Executed only for root messages, once per step.
 * - Roughly ~3 queries per depth level (agent -> child user -> child agent).
 * - Most messages are depth 1 (about 1-2 indexed queries), almost all under depth 2 (~2-6).
 * - Queries fetch only IDs/runIds and rely on
 *   `user_messages_workspace_agentic_origin_idx` for fast descendant lookup.
 */
async function collectDescendantRunIds(
  auth: Authenticator,
  { rootAgentMessageId }: { rootAgentMessageId: string }
): Promise<string[]> {
  const workspace = auth.getNonNullableWorkspace();
  const visitedAgentMessageIds = new Set<string>();
  const runIds = new Set<string>();
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

  return [...runIds];
}
