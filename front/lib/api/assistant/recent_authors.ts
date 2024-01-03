import { AgentRecentAuthors, UserType } from "@dust-tt/types";
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
    // Redis only supports strings.
    value: a.get("authorId").toString(),
    score: a.version,
  }));

  await setAuthorIdsWithVersionInRedis(
    agentId,
    workspaceId,
    authorIdsWithScore
  );

  return recentAuthorIdsWithVersion.map((a) => a.authorId.toString());
}

function renderAuthors(
  authorIds: readonly string[],
  members: UserType[],
  currentUserId?: number
): readonly string[] {
  return (
    authorIds
      .map((id) => parseInt(id, 10))
      .map((authorId) => {
        // If authorId is the current requester, return "Me".
        if (authorId === currentUserId) {
          return "Me";
        }
        return members.find((m) => m.id === authorId)?.fullName ?? null;
      })
      // Filter out `undefined` authors.
      .filter((name): name is string => name !== null)
  );
}

export async function getAgentRecentAuthors(
  {
    agentId,
    workspaceId,
    isGlobalAgent,
    currentUserId,
  }: {
    agentId: string;
    workspaceId: string;
    isGlobalAgent: boolean;
    currentUserId?: number;
  },
  members: UserType[]
): Promise<AgentRecentAuthors> {
  // For global agents, which have no authors, return early.
  if (isGlobalAgent) {
    return [];
  }

  const agentRecentAuthorIdsKey = _getRecentAuthorIdsKey({
    agentId,
    workspaceId,
  });

  let recentAuthorIds = await safeRedisClient(async (redis) =>
    redis.zRange(agentRecentAuthorIdsKey, 0, 2, { REV: true })
  );

  if (recentAuthorIds.length === 0) {
    // Populate from the database and store in Redis if the entry is not already present.
    recentAuthorIds = await populateAuthorIdsFromDb(agentId, workspaceId);
  }

  // Consider moving this logic to the FE if we need to fetch members in different places.
  return renderAuthors(recentAuthorIds, members, currentUserId);
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
