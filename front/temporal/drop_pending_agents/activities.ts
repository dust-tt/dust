import { heartbeat } from "@temporalio/activity";
import { Op } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import logger from "@app/logger/logger";

/**
 * Get IDs of pending agents older than the specified number of days.
 */
export async function getPendingAgentsOlderThanActivity(
  days: number
): Promise<number[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const pendingAgents = await AgentConfigurationModel.findAll({
    attributes: ["id"],
    where: {
      status: "pending",
      createdAt: {
        [Op.lt]: cutoffDate,
      },
    },
  });

  logger.info(
    {
      days,
      cutoffDate,
      count: pendingAgents.length,
    },
    "[Drop Pending Agents] Found pending agents older than cutoff."
  );

  return pendingAgents.map((a) => a.id);
}

/**
 * Hard delete a batch of pending agents by their IDs.
 */
export async function destroyPendingAgentsBatchActivity({
  agentIds,
}: {
  agentIds: number[];
}): Promise<{ deletedCount: number }> {
  let deletedCount = 0;

  for (const agentId of agentIds) {
    const result = await AgentConfigurationModel.destroy({
      where: {
        id: agentId,
        status: "pending",
      },
    });

    if (result > 0) {
      deletedCount++;
      logger.info(
        { agentId },
        "[Drop Pending Agents] Deleted pending agent."
      );
    } else {
      logger.warn(
        { agentId },
        "[Drop Pending Agents] Agent not found or not in pending status."
      );
    }

    heartbeat();
  }

  logger.info(
    { agentIds, deletedCount },
    "[Drop Pending Agents] Batch deletion completed."
  );

  return { deletedCount };
}
