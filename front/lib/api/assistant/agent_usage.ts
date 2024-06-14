import type {
  AgentUsageType,
  LightAgentConfigurationType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { literal, Op, Sequelize } from "sequelize";

import { getUsersWithAgentInListCount } from "@app/lib/api/assistant/user_relation";
import { getMembersCount } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import {
  Conversation,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import { redisClient } from "@app/lib/redis";

// Ranking of agents is done over a 30 days period.
const rankingTimeframeSec = 60 * 60 * 24 * 30; // 30 days

// Computing agent mention count over a 2h period
const popularityComputationTimeframeSec = 2 * 60 * 60;

export type mentionCount = {
  agentId: string;
  count: number;
};

function _getAgentInListCountKey({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  // One key to store the number of users who have this agent in their list.
  return `agent_in_list_count_${workspaceId}_${agentConfigurationId}`;
}

function _getUsageKeys(workspaceId: string) {
  // One hash per workspace with keys the agent id and value the corresponding
  // number of mentions
  const agentMessageCountKey = `agent_usage_count_${workspaceId}`;

  // One hash per workspace with keys agent id for counting the number of
  // users that have mentioned the agent.
  const agentUserCountKey = `agent_user_count_${workspaceId}`;

  return {
    agentMessageCountKey,
    agentUserCountKey,
  };
}

export async function getAgentsUsage({
  workspaceId,
  providedRedis,
}: {
  workspaceId: string;
  providedRedis?: Awaited<ReturnType<typeof redisClient>>;
}): Promise<mentionCount[]> {
  const owner = await Workspace.findOne({ where: { sId: workspaceId } });
  if (!owner) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const { agentMessageCountKey } = _getUsageKeys(workspaceId);
  const redis = providedRedis ?? (await redisClient());

  try {
    const agentMessageCountTTL = await redis.ttl(agentMessageCountKey);

    // agent mention count doesn't exist
    if (agentMessageCountTTL === -2) {
      const [agentMessageCounts, userCounts] = await Promise.all([
        agentMentionsCount(owner.id),
        agentMentionsUserCount(owner.id),
      ]);
      await storeCountsInRedis(
        workspaceId,
        agentMessageCounts,
        userCounts,
        redis
      );
      // agent mention count is stale
    } else if (agentMessageCountTTL < popularityComputationTimeframeSec) {
      void (async () => {
        const [agentMessageCounts, userCounts] = await Promise.all([
          agentMentionsCount(owner.id),
          agentMentionsUserCount(owner.id),
        ]);
        void storeCountsInRedis(
          workspaceId,
          agentMessageCounts,
          userCounts,
          redis
        );
      })();
    }

    // Retrieve and parse agents usage
    const agentsUsage = await redis.hGetAll(agentMessageCountKey);
    return Object.entries(agentsUsage).map(([agentId, count]) => {
      return { agentId, count: parseInt(count) };
    });
  } finally {
    // Close the redis connection if it was created locally
    if (!providedRedis) {
      await redis.quit();
    }
  }
}

// We don't need real-time accuracy on the number of members
// that added the agent in their list.
// Best-effort, we cache the result for a day.
async function getAgentInListCount(
  auth: Authenticator,
  redis: Awaited<ReturnType<typeof redisClient>>,
  workspaceId: string,
  agentConfiguration: LightAgentConfigurationType
) {
  const agentInListCountKey = _getAgentInListCountKey({
    agentConfigurationId: agentConfiguration.sId,
    workspaceId,
  });

  const cachedCount = await redis.get(agentInListCountKey);
  if (cachedCount !== null) {
    return parseInt(cachedCount, 10);
  }

  const calculateAndCacheCount = async (countPromise: Promise<number>) => {
    const count = await countPromise;
    await redis.set(agentInListCountKey, count.toString(), {
      EX: 86400, // Cache for 1 day.
    });
    return count;
  };

  // Determine the count based on the scope and cache the result.
  switch (agentConfiguration.scope) {
    case "published":
      return calculateAndCacheCount(
        getUsersWithAgentInListCount(auth, agentConfiguration.sId)
      );
    case "workspace":
      return calculateAndCacheCount(
        getMembersCount(auth, { activeOnly: true })
      );
    case "global":
    case "private":
      return 0;
    default:
      assertNever(agentConfiguration.scope);
  }
}

export async function getAgentUsage(
  auth: Authenticator,
  {
    workspaceId,
    agentConfiguration,
    providedRedis,
  }: {
    workspaceId: string;
    agentConfiguration: LightAgentConfigurationType;
    providedRedis?: Awaited<ReturnType<typeof redisClient>>;
  }
): Promise<AgentUsageType> {
  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;
  const { sId: agentConfigurationId } = agentConfiguration;

  const { agentMessageCountKey, agentUserCountKey } =
    _getUsageKeys(workspaceId);

  try {
    redis = providedRedis ?? (await redisClient());

    const [agentUsage, userUsage] = await Promise.all([
      redis.hGet(agentMessageCountKey, agentConfigurationId),
      redis.hGet(agentUserCountKey, agentConfigurationId),
    ]);
    const messageCount = agentUsage ? parseInt(agentUsage, 10) : 0;
    const userCount = userUsage ? parseInt(userUsage, 10) : 0;
    const usersWithAgentInListCount = await getAgentInListCount(
      auth,
      redis,
      workspaceId,
      agentConfiguration
    );
    return {
      messageCount,
      userCount,
      timePeriodSec: rankingTimeframeSec,
      usersWithAgentInListCount,
    };
  } finally {
    if (redis && !providedRedis) {
      await redis.quit();
    }
  }
}

export async function agentMentionsUserCount(
  workspaceId: number
): Promise<mentionCount[]> {
  return Mention.findAll({
    attributes: [
      "agentConfigurationId",
      [
        Sequelize.fn(
          "COUNT",
          Sequelize.literal('DISTINCT "message->userMessage"."userId"')
        ),
        "count",
      ],
    ],
    where: {
      createdAt: {
        [Op.gt]: Sequelize.literal("NOW() - INTERVAL '30 days'"),
      },
    },
    include: [
      {
        model: Message,
        required: true,
        attributes: [],
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            attributes: [], // No attributes are necessary here for grouping
            required: true,
          },
          {
            model: Conversation,
            as: "conversation",
            attributes: [],
            required: true,
            where: {
              workspaceId: workspaceId,
            },
          },
        ],
      },
    ],
    order: [["count", "DESC"]],
    group: ["mention.agentConfigurationId"],
    raw: true,
  }).then((results) =>
    results.map((mention) => ({
      agentId: mention.agentConfigurationId as string,
      count: (mention as unknown as { count: number }).count,
    }))
  );
}

export async function agentMentionsCount(
  workspaceId: number
): Promise<mentionCount[]> {
  return Mention.findAll({
    attributes: [
      "agentConfigurationId",
      [Sequelize.fn("COUNT", Sequelize.col("mention.id")), "count"],
    ],
    where: {
      createdAt: {
        [Op.gt]: literal("NOW() - INTERVAL '30 days'"),
      },
    },
    include: [
      {
        model: Message,
        required: true,
        attributes: [],
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            attributes: [],
            required: true,
          },
          {
            model: Conversation,
            as: "conversation",
            attributes: [],
            required: true,
            where: {
              workspaceId: workspaceId,
            },
          },
        ],
      },
    ],
    order: [["count", "DESC"]],
    group: ["mention.agentConfigurationId"],
    raw: true,
  }).then((results) =>
    results.map((mention) => ({
      agentId: mention.agentConfigurationId as string,
      count: (mention as unknown as { count: number }).count,
    }))
  );
}

export async function storeCountsInRedis(
  workspaceId: string,
  agentMessageCounts: mentionCount[],
  userCounts: mentionCount[],
  redis: Awaited<ReturnType<typeof redisClient>>
) {
  const transaction = redis.multi();
  const { agentMessageCountKey, agentUserCountKey } =
    _getUsageKeys(workspaceId);

  agentMessageCounts.forEach(({ agentId, count }) => {
    transaction.hSet(agentMessageCountKey, agentId, count);
  });
  transaction.expire(
    agentMessageCountKey,
    popularityComputationTimeframeSec * 2
  );

  userCounts.forEach(({ agentId, count }) => {
    transaction.hSet(agentUserCountKey, agentId, count);
  });
  transaction.expire(agentUserCountKey, popularityComputationTimeframeSec * 2);

  const results = await transaction.exec();
  if (results.includes(null)) {
    throw new Error("Transaction failed and was rolled back.");
  }
}
