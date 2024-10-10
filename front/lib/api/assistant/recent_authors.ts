import type {
  AgentRecentAuthors,
  LightAgentConfigurationType,
  UserType,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";
import { Sequelize } from "sequelize";

import { runOnRedis } from "@app/lib/api/redis";
import { getGlobalAgentAuthorName } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { UserResource } from "@app/lib/resources/user_resource";

// We keep the most recent authorIds for 3 days.
const recentAuthorIdsKeyTTL = 60 * 60 * 24 * 3; // 3 days.

function _getRecentAuthorIdsKey({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
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

/**
 * Inserts or updates authors with their respective version scores into a Redis sorted set.
 * The operation is a 'best effort' that does not remove outdated authors because the sorted set has a TTL.
 * This approach is cost-effective, as the TTL naturally clears out old data without extra cleanup overhead.
 */
async function setAuthorIdsWithVersionInRedis(
  {
    agentId,
    workspaceId,
  }: {
    agentId: string;
    workspaceId: string;
  },
  authorIdsWithScore: { value: string; score: number }[]
) {
  const agentRecentAuthorIdsKey = _getRecentAuthorIdsKey({
    agentId,
    workspaceId,
  });

  await runOnRedis({ origin: "update_authors" }, async (redis) => {
    // Add <authorId:version> pairs to the sorted set, only if the version is greater than the one stored.
    await redis.zAdd(agentRecentAuthorIdsKey, authorIdsWithScore, { GT: true });
    // Set the expiry for the sorted set to manage its lifecycle.
    await redis.expire(agentRecentAuthorIdsKey, recentAuthorIdsKeyTTL);
  });
}

async function populateAuthorIdsFromDb({
  agentId,
  workspaceId,
}: {
  agentId: string;
  workspaceId: string;
}) {
  const recentAuthorIdsWithVersion =
    await fetchRecentAuthorIdsWithVersion(agentId);

  if (recentAuthorIdsWithVersion.length === 0) {
    return [];
  }

  const authorIdsWithScore = recentAuthorIdsWithVersion.map((a) => ({
    // Redis only supports strings.
    value: a.get("authorId").toString(),
    score: a.version,
  }));

  await setAuthorIdsWithVersionInRedis(
    {
      agentId,
      workspaceId,
    },
    authorIdsWithScore
  );

  return recentAuthorIdsWithVersion.map((a) => a.authorId.toString());
}

function renderAuthors(
  authors: UserType[],
  currentUserId?: number
): readonly string[] {
  return (
    authors
      .map((author) => {
        // If authorId is the current requester, return "Me".
        if (author.id === currentUserId) {
          return "Me";
        }
        return author.fullName;
      })
      // Filter out `null` authors.
      .filter((name): name is string => name !== null)
  );
}

export async function getAgentsRecentAuthors({
  agents,
  auth,
}: {
  agents: LightAgentConfigurationType[];
  auth: Authenticator;
}): Promise<AgentRecentAuthors[]> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Owner is required");
  }
  const { sId: workspaceId } = owner;
  const currentUserId = auth.user()?.id;

  const recentAuthorsIdsByAgentId: Record<string, number[] | null> = (
    await Promise.all(
      agents.map(async (agent): Promise<[string, number[] | null]> => {
        const { sId: agentId } = agent;

        if (agent.scope === "global") {
          return [agentId, null];
        }
        const agentRecentAuthorIdsKey = _getRecentAuthorIdsKey({
          agentId,
          workspaceId,
        });
        let recentAuthorIds = await runOnRedis(
          { origin: "agent_recent_authors" },
          async (redis) =>
            redis.zRange(agentRecentAuthorIdsKey, 0, 2, { REV: true })
        );
        if (recentAuthorIds.length === 0) {
          // Populate from the database and store in Redis if the entry is not already present.
          recentAuthorIds = await populateAuthorIdsFromDb({
            agentId,
            workspaceId,
          });
        }
        return [agentId, recentAuthorIds.map((id) => parseInt(id, 10))];
      })
    )
  ).reduce<Record<string, number[] | null>>(
    (acc, [agentId, recentAuthorIds]) => {
      acc[agentId] = recentAuthorIds;
      return acc;
    },
    {}
  );

  const authorByUserId: Record<number, UserType> = (
    await UserResource.fetchByModelIds(
      removeNulls(
        Array.from(new Set(Object.values(recentAuthorsIdsByAgentId).flat()))
      )
    )
  ).reduce<Record<number, UserType>>((acc, user) => {
    acc[user.id] = user.toJSON();
    return acc;
  }, {});

  return agents.map((agent) => {
    const recentAuthorIds = recentAuthorsIdsByAgentId[agent.sId];
    if (recentAuthorIds === null) {
      return [getGlobalAgentAuthorName(agent.sId)];
    }
    return renderAuthors(
      removeNulls(recentAuthorIds.map((id) => authorByUserId[id])),
      currentUserId
    );
  });
}

export async function getAgentRecentAuthors({
  agent,
  auth,
}: {
  agent: LightAgentConfigurationType;
  auth: Authenticator;
}): Promise<AgentRecentAuthors> {
  const recentAuthors = await getAgentsRecentAuthors({
    agents: [agent],
    auth,
  });
  return recentAuthors[0];
}

export async function agentConfigurationWasUpdatedBy({
  agent,
  auth,
}: {
  agent: LightAgentConfigurationType;
  auth: Authenticator;
}) {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Owner is required");
  }

  const { sId: workspaceId } = owner;
  const { sId: agentId, version, versionAuthorId: authorId } = agent;

  if (!authorId) {
    return;
  }

  await setAuthorIdsWithVersionInRedis(
    {
      agentId,
      workspaceId,
    },
    [{ value: authorId.toString(), score: version }]
  );
}
