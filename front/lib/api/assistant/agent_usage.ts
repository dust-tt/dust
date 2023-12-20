import { AgentUsageType, ModelId } from "@dust-tt/types";
import { literal, Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { Mention, Message, UserMessage } from "@app/lib/models";
import { redisClient } from "@app/lib/redis";

function _getKeys(agentConfigurationId: string) {
  // One sorted set per agent for counting the number of times the agent has been used.
  // score is: timestamp of each use of the agent
  // value: random unique distinct value. Strong random generation not needed here.
  const agentUsedCountKey = `agent_usage_count_${agentConfigurationId}`;

  // One sorted set per agent for counting the number of users that have used the agent.
  // score is: last timestamp of usage by a given user
  // value: user_id
  const agentUserCountKey = `agent_user_count_${agentConfigurationId}`;
  return {
    agentUsedCountKey,
    agentUserCountKey,
  };
}

async function signalInRedis({
  agentConfigurationId,
  userId,
  timestamp,
  redis,
}: {
  agentConfigurationId: string;
  userId: string;
  timestamp: number;
  messageId: ModelId;
  redis: Awaited<ReturnType<typeof redisClient>> | undefined;
}) {
  const rankingTTL = 60 * 60 * 24 * 30; // 30 days
  let needRedisQuit = false;
  const { agentUsedCountKey, agentUserCountKey } =
    _getKeys(agentConfigurationId);

  try {
    if (!redis) {
      needRedisQuit = true;
      redis = await redisClient();
    }

    await redis.zAdd(agentUsedCountKey, {
      score: timestamp,
      value: uuidv4(),
    });
    await redis.expire(agentUsedCountKey, rankingTTL);

    await redis.zAdd(agentUserCountKey, {
      score: timestamp,
      value: userId,
    });
    await redis.expire(agentUserCountKey, rankingTTL);
  } finally {
    if (redis && needRedisQuit) {
      await redis.quit();
    }
  }
}

async function populateUsageIfNeeded({
  agentConfigurationId,
  messageId,
  redis,
}: {
  agentConfigurationId: string;
  messageId: ModelId | null;
  redis: Awaited<ReturnType<typeof redisClient>>;
}) {
  const { agentUsedCountKey, agentUserCountKey } =
    _getKeys(agentConfigurationId);

  const existCount = await redis.exists([agentUsedCountKey, agentUserCountKey]);
  if (existCount === 0) {
    // Sorted sets for this agent usage do not exist, we'll populate them
    // by fetching the data from the database.
    // We need to ensure that only one process is going through the populate code path
    // so we are using redis.incr() to act as a non blocking lock.
    const populateLockKey = `agent_usage_populate_${agentConfigurationId}`;
    const needToPopulate = (await redis.incr(populateLockKey)) === 1;

    // Keeping the lock key around for 10 minutes, which essentially gives 10 minutes
    // to create the sorted sets, before running the risk of a race conditions.
    // A race condition in creating the sorted sets would result in double counting
    // usage of the agent.
    const populateTimeoutSec = 60 * 10; // 10 minutes
    await redis.expire(populateLockKey, populateTimeoutSec);
    if (!needToPopulate) {
      return;
    }

    // We are safe to populate the sorted sets until the Redis populateLockKey expires.
    // Get all mentions for this agent that have a messageId bigger than messageId
    // and that happened within the last 30 days.
    const mentions = await Mention.findAll({
      where: {
        ...{
          agentConfigurationId: agentConfigurationId,
          createdAt: {
            [Op.gt]: literal(`NOW() - INTERVAL '30 days'`),
          },
        },
        ...(messageId ? { messageId: { [Op.lt]: messageId } } : {}),
      },
      include: [
        {
          model: Message,
          required: true,
          include: [
            {
              model: UserMessage,
              as: "userMessage",
              required: true,
            },
          ],
        },
      ],
    });
    for (const mention of mentions) {
      // No need to promise.all() here, as one Redis connection can only execute one command
      // at a time.
      if (mention.message?.userMessage?.userContextUsername) {
        await signalInRedis({
          agentConfigurationId,
          userId:
            mention.message.userMessage.userId?.toString() ||
            mention.message.userMessage.userContextEmail ||
            mention.message.userMessage.userContextUsername,
          timestamp: mention.createdAt.getTime(),
          messageId: mention.messageId,
          redis,
        });
      }
    }
  }
}

export async function getAgentUsage({
  agentConfigurationId,
}: {
  agentConfigurationId: string;
}): Promise<AgentUsageType> {
  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;

  // One sorted set per agent for counting the number of times the agent has been used.
  // score is: timestamp of each use of the agent
  // value: random unique distinct value. Strong random generation not needed here.
  const agentUsedCountKey = `agent_usage_count_${agentConfigurationId}`;

  // One sorted set per agent for counting the number of users that have used the agent.
  // score is: last timestamp of usage by a given user
  // value: user_id
  const agentUserCountKey = `agent_user_count_${agentConfigurationId}`;

  try {
    redis = await redisClient();
    await populateUsageIfNeeded({
      agentConfigurationId,
      messageId: null,
      redis,
    });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
    const usageCount = await redis.zCount(
      agentUsedCountKey,
      thirtyDaysAgo.getTime(),
      now.getTime()
    );
    const userCount = await redis.zCount(
      agentUserCountKey,
      thirtyDaysAgo.getTime(),
      now.getTime()
    );

    return {
      usageCount,
      userCount,
    };
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}

export async function signalAgentUsage({
  agentConfigurationId,
  userId,
  timestamp,
  messageId,
}: {
  agentConfigurationId: string;
  userId: string;
  timestamp: number;
  messageId: ModelId;
}) {
  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;
  try {
    redis = await redisClient();
    await populateUsageIfNeeded({
      agentConfigurationId,
      messageId,
      redis,
    });
    await signalInRedis({
      agentConfigurationId,
      userId,
      timestamp,
      messageId,
      redis,
    });
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}
