import { AgentRecentAuthorIds } from "@dust-tt/types";
import { Sequelize } from "sequelize";

import { AgentConfiguration } from "@app/lib/models";
import { safeRedisClient } from "@app/lib/redis";

// We keep the most recent authorIds for 7 days.
const rankingTimeframeSec = 60 * 60 * 24 * 7; // 7 days.

function _getRecentAuthorIdsKey({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}) {
  // One sorted set per agent for keeping record of the most recent author ids, with:
  // score: version of each configuration of the agent
  // value: author id.
  return `agent_recent_author_ids_${workspaceId}_${agentId}`;
}

async function fetchRecentAuthorIdsWithVersion(agentId: string) {
  return AgentConfiguration.findAll({
    attributes: [
      "authorId",
      [Sequelize.fn("MAX", Sequelize.col("version")), "version"],
    ],
    group: "authorId",
    where: {
      sId: agentId,
    },
    order: [
      ["version", "DESC"], // Order by version descending.
      ["authorId", "DESC"],
    ],
    limit: 3, // Limit to the last 3 authors.
  });
}

async function setAuthorIdsWithVersionInRedis(
  agentId: string,
  workspaceId: string,
  authorIdsWithScore: { value: string; score: number }[]
) {
  const agentRecentAuthorIdsKey = _getRecentAuthorIdsKey({
    agentId,
    workspaceId,
  });
  await safeRedisClient(async (redis) => {
    // Insert <authorId:version> into Redis sorted set.
    // Update only if the author is new or the version is higher.
    await redis.zAdd(agentRecentAuthorIdsKey, authorIdsWithScore, { GT: true });
    await redis.expire(agentRecentAuthorIdsKey, rankingTimeframeSec);
  });
}

async function populateAuthorIdsFromDb(agentId: string, workspaceId: string) {
  const recentAuthorIdsWithVersion = await fetchRecentAuthorIdsWithVersion(
    agentId
  );

  if (recentAuthorIdsWithVersion.length === 0) {
    return [];
  }

  const authorIdsWithScore = recentAuthorIdsWithVersion.map((a) => ({
    value: a.get("authorId").toFixed(),
    score: a.version,
  }));

  await setAuthorIdsWithVersionInRedis(
    agentId,
    workspaceId,
    authorIdsWithScore
  );

  return recentAuthorIdsWithVersion.map((a) => a.authorId);
}

export async function getAgentRecentAuthorIds({
  agentId,
  workspaceId,
  isGlobalAgent,
}: {
  agentId: string;
  workspaceId: string;
  isGlobalAgent: boolean;
}): Promise<AgentRecentAuthorIds> {
  // For global agents, which have no authors, return early.
  if (isGlobalAgent) {
    return [];
  }

  const agentRecentAuthorIdsKey = _getRecentAuthorIdsKey({
    agentId,
    workspaceId,
  });

  const recentAuthorIds = await safeRedisClient(async (redis) =>
    redis.zRange(agentRecentAuthorIdsKey, 0, 2, { REV: true })
  );

  if (recentAuthorIds.length > 0) {
    return recentAuthorIds.map((n) => Number.parseInt(n, 10));
  }

  // Populate from the database and store in Redis if the entry is not already present.
  return await populateAuthorIdsFromDb(agentId, workspaceId);
}

export async function agentConfigurationWasUpdatedBy({
  agentId,
  workspaceId,
  authorId,
  version,
}: {
  agentId: string;
  workspaceId: string;
  authorId: string;
  version: number;
}) {
  await setAuthorIdsWithVersionInRedis(agentId, workspaceId, [
    { value: authorId, score: version },
  ]);
}
