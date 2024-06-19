import type { AgentConfigurationType, AgentUsageType } from "@dust-tt/types";
import { literal, Op, Sequelize } from "sequelize";

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

const TTL_KEY_NOT_EXIST = -2;

type agentUsage = {
  agentId: string;
  messageCount: number;
  userCount: number;
  timePeriodSec: number;
};

type mentionCount = {
  agentId: string;
  count: number;
  timePeriodSec: number;
};

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
  limit,
}: {
  workspaceId: string;
  providedRedis?: Awaited<ReturnType<typeof redisClient>>;
  limit?: number;
}): Promise<agentUsage[]> {
  const owner = await Workspace.findOne({ where: { sId: workspaceId } });
  if (!owner) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;

  const { agentMessageCountKey, agentUserCountKey } =
    _getUsageKeys(workspaceId);

  try {
    redis = providedRedis ?? (await redisClient());
    const agentMessageCountTTL = await redis.ttl(agentMessageCountKey);

    // agent mention count doesn't exist
    if (agentMessageCountTTL === TTL_KEY_NOT_EXIST) {
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
    const userCount = await redis.hGetAll(agentUserCountKey);
    return Object.entries(agentsUsage)
      .map(([agentId, count]) => ({
        agentId,
        messageCount: parseInt(count),
        timePeriodSec: rankingTimeframeSec,
        userCount: parseInt(userCount[agentId]) ?? 1,
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, limit);
  } finally {
    if (redis && !providedRedis) {
      await redis.quit();
    }
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
    agentConfiguration: AgentConfigurationType;
    providedRedis?: Awaited<ReturnType<typeof redisClient>>;
  }
): Promise<AgentUsageType> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call");
  }
  if (owner.sId !== workspaceId) {
    throw new Error("Provided workspace and owner workspace do not match.");
  }

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
    return {
      messageCount,
      userCount,
      timePeriodSec: rankingTimeframeSec,
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
  const mentions = await Mention.findAll({
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
  });
  return mentions.map((mention) => ({
    agentId: mention.agentConfigurationId as string,
    count: (mention as unknown as { count: number }).count,
    timePeriodSec: rankingTimeframeSec,
  }));
}

export async function agentMentionsCount(
  workspaceId: number
): Promise<mentionCount[]> {
  const mentions = await Mention.findAll({
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
  });
  return mentions.map((mention) => ({
    agentId: mention.agentConfigurationId as string,
    count: (mention as unknown as { count: number }).count,
    timePeriodSec: rankingTimeframeSec,
  }));
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

export async function signalAgentUsage({
  agentConfigurationId,
  workspaceId,
}: {
  agentConfigurationId: string;
  workspaceId: string;
}) {
  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;

  try {
    redis = await redisClient();
    const { agentMessageCountKey } = _getUsageKeys(workspaceId);
    await redis.hIncrBy(agentMessageCountKey, agentConfigurationId, 1);
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}
