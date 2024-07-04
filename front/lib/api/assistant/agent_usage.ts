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

// Computing agent mention count over a 12h period
const popularityComputationTimeframeSec = 12 * 60 * 60;

const TTL_KEY_NOT_EXIST = -2;
const TTL_KEY_NOT_SET = -1;

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

    // agent mention count doesn't exist or wasn't set to expire
    if (
      agentMessageCountTTL === TTL_KEY_NOT_EXIST ||
      agentMessageCountTTL === TTL_KEY_NOT_SET
    ) {
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
  // We retrieve mentions from conversations in order to optimize the query
  // Since we need to filter out by workspace id, retrieving mentions first
  // would lead to retrieve every single messages
  const mentions = await Conversation.findAll({
    attributes: [
      [
        Sequelize.literal('"messages->mentions"."agentConfigurationId"'),
        "agentConfigurationId",
      ],
      [
        Sequelize.fn(
          "COUNT",
          Sequelize.literal('DISTINCT "messages->userMessage"."userId"')
        ),
        "count",
      ],
    ],
    where: {
      workspaceId: workspaceId,
    },
    include: [
      {
        model: Message,
        required: true,
        attributes: [],
        where: {
          createdAt: {
            [Op.gt]: literal("NOW() - INTERVAL '30 days'"),
          },
        },
        include: [
          {
            model: UserMessage,
            as: "userMessage",
            required: true,
            attributes: [],
            where: {
              userId: {
                [Op.not]: null,
              },
            },
          },
          {
            model: Mention,
            as: "mentions",
            required: true,
            attributes: [],
          },
        ],
      },
    ],
    order: [["count", "DESC"]],
    group: ['"messages->mentions"."agentConfigurationId"'],
    raw: true,
  });
  return mentions.map((mention) => {
    const castMention = mention as unknown as {
      agentConfigurationId: string;
      count: number;
    };
    return {
      agentId: castMention.agentConfigurationId,
      count: castMention.count,
      timePeriodSec: rankingTimeframeSec,
    };
  });
}

export async function agentMentionsCount(
  workspaceId: number
): Promise<mentionCount[]> {
  // We retrieve mentions from conversations in order to optimize the query
  // Since we need to filter out by workspace id, retrieving mentions first
  // would lead to retrieve every single messages
  const mentions = await Conversation.findAll({
    attributes: [
      [
        Sequelize.literal('"messages->mentions"."agentConfigurationId"'),
        "agentConfigurationId",
      ],
      [
        Sequelize.fn("COUNT", Sequelize.literal('"messages->mentions"."id"')),
        "count",
      ],
    ],
    where: {
      workspaceId: workspaceId,
    },
    include: [
      {
        model: Message,
        required: true,
        attributes: [],
        where: {
          createdAt: {
            [Op.gt]: literal("NOW() - INTERVAL '30 days'"),
          },
        },
        include: [
          {
            model: Mention,
            as: "mentions",
            required: true,
            attributes: [],
          },
        ],
      },
    ],
    order: [["count", "DESC"]],
    group: ['"messages->mentions"."agentConfigurationId"'],
    raw: true,
  });
  return mentions.map((mention) => {
    const castMention = mention as unknown as {
      agentConfigurationId: string;
      count: number;
    };
    return {
      agentId: castMention.agentConfigurationId,
      count: castMention.count,
      timePeriodSec: rankingTimeframeSec,
    };
  });
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
    const agentMessageCountTTL = await redis.ttl(agentMessageCountKey);
    if (agentMessageCountTTL !== TTL_KEY_NOT_EXIST) {
      // We only want to increment if the counts have already been computed
      await redis.hIncrBy(agentMessageCountKey, agentConfigurationId, 1);
    }
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}
