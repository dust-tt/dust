import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentRecentAuthors,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { getGlobalAgentAuthorName } from "@app/types/assistant/assistant";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import { Op, Sequelize } from "sequelize";

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

async function fetchRecentAuthorIdsWithVersionForAgents(
  auth: Authenticator,
  { agentIds }: { agentIds: string[] }
): Promise<Map<string, { authorId: number; version: number }[]>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const rows = await AgentConfigurationModel.findAll({
    attributes: [
      "sId",
      "authorId",
      [Sequelize.fn("MAX", Sequelize.col("version")), "version"],
    ],
    group: ["sId", "authorId"],
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: { [Op.in]: agentIds },
    },
  });

  const byAgentId = new Map<string, { authorId: number; version: number }[]>();
  for (const row of rows) {
    const agentId = row.get("sId") as string;
    const authorId = row.get("authorId") as number;
    // `version` is aliased from MAX(version) so read it via get().
    const version = row.get("version") as number;
    const bucket = byAgentId.get(agentId) ?? [];
    bucket.push({ authorId, version });
    byAgentId.set(agentId, bucket);
  }

  // Per-agent top-3 by (version DESC, authorId DESC) to match the previous
  // per-agent query's ordering and LIMIT 3.
  for (const [agentId, authors] of byAgentId) {
    authors.sort((a, b) => {
      if (b.version !== a.version) {
        return b.version - a.version;
      }
      return b.authorId - a.authorId;
    });
    byAgentId.set(agentId, authors.slice(0, 3));
  }

  return byAgentId;
}

/**
 * Inserts or updates authors with their respective version scores into a Redis sorted set.
 * The operation is a 'best effort' that does not remove outdated authors because the sorted set has a TTL.
 * This approach is cost-effective, as the TTL naturally clears out old data without extra cleanup overhead.
 */
async function setAuthorIdsWithVersionInRedis(
  auth: Authenticator,
  {
    agentId,
    authorIdsWithScore,
  }: {
    agentId: string;
    authorIdsWithScore: { value: string; score: number }[];
  }
) {
  const agentRecentAuthorIdsKey = _getRecentAuthorIdsKey({
    agentId,
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  await runOnRedis({ origin: "update_authors" }, async (redis) => {
    // Add <authorId:version> pairs to the sorted set, only if the version is greater than the one stored.
    await redis.zAdd(agentRecentAuthorIdsKey, authorIdsWithScore, { GT: true });
    // Set the expiry for the sorted set to manage its lifecycle.
    await redis.expire(agentRecentAuthorIdsKey, recentAuthorIdsKeyTTL);
  });
}

async function populateAuthorIdsFromDbForAgents(
  auth: Authenticator,
  { agentIds }: { agentIds: string[] }
): Promise<Map<string, string[]>> {
  const recentAuthorsByAgentId = await fetchRecentAuthorIdsWithVersionForAgents(
    auth,
    { agentIds }
  );

  const result = new Map<string, string[]>();
  for (const agentId of agentIds) {
    const authors = recentAuthorsByAgentId.get(agentId) ?? [];
    result.set(
      agentId,
      authors.map((a) => a.authorId.toString())
    );
  }

  const agentsWithAuthors = agentIds.filter(
    (agentId) => (recentAuthorsByAgentId.get(agentId) ?? []).length > 0
  );

  await concurrentExecutor(
    agentsWithAuthors,
    async (agentId) => {
      const authors = recentAuthorsByAgentId.get(agentId) ?? [];
      await setAuthorIdsWithVersionInRedis(auth, {
        agentId,
        authorIdsWithScore: authors.map((a) => ({
          // Redis only supports strings.
          value: a.authorId.toString(),
          score: a.version,
        })),
      });
    },
    { concurrency: 8 }
  );

  return result;
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
  const owner = auth.getNonNullableWorkspace();
  const currentUserId = auth.user()?.id;

  const nonGlobalAgents = agents.filter((agent) => agent.scope !== "global");

  // First pass: read Redis for all non-global agents concurrently.
  const redisResults = await concurrentExecutor(
    nonGlobalAgents,
    async (agent): Promise<[string, string[]]> => {
      const { sId: agentId } = agent;
      const agentRecentAuthorIdsKey = _getRecentAuthorIdsKey({
        agentId,
        workspaceId: owner.sId,
      });
      const recentAuthorIds = await runOnRedis(
        { origin: "agent_recent_authors" },
        async (redis) =>
          redis.zRange(agentRecentAuthorIdsKey, 0, 2, { REV: true })
      );
      return [agentId, recentAuthorIds];
    },
    { concurrency: 8 }
  );

  // Collect cold-cache agent IDs and batch-fetch them in a single SQL query.
  const coldCacheAgentIds = redisResults
    .filter(([, ids]) => ids.length === 0)
    .map(([agentId]) => agentId);
  const dbBackfill = await populateAuthorIdsFromDbForAgents(auth, {
    agentIds: coldCacheAgentIds,
  });

  const recentAuthorsIdsByAgentId: Record<string, number[] | null> = {};
  for (const agent of agents) {
    if (agent.scope === "global") {
      recentAuthorsIdsByAgentId[agent.sId] = null;
    }
  }
  for (const [agentId, redisIds] of redisResults) {
    const ids =
      redisIds.length > 0 ? redisIds : (dbBackfill.get(agentId) ?? []);
    recentAuthorsIdsByAgentId[agentId] = ids.map((id) => parseInt(id, 10));
  }

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
  const { sId: agentId, version, versionAuthorId: authorId } = agent;
  if (!authorId) {
    return;
  }

  await setAuthorIdsWithVersionInRedis(auth, {
    agentId,
    authorIdsWithScore: [{ value: authorId.toString(), score: version }],
  });
}
