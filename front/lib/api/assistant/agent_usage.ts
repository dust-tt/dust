import type {
  AgentUsageType,
  LightAgentConfigurationType,
  ModelId,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { literal, Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { getUsersWithAgentInListCount } from "@app/lib/api/assistant/user_relation";
import { getMembersCount } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import {
  Conversation as DBConversation,
  Mention,
  Message,
  UserMessage,
  Workspace,
} from "@app/lib/models";
import { redisClient } from "@app/lib/redis";

// Ranking of agents is done over a 30 days period.
const rankingTimeframeSec = 60 * 60 * 24 * 30; // 30 days

function _getKeys({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  // One sorted set per agent for counting the number of messages from the agent.
  // score is: timestamp of each message of the agent
  // value: random unique distinct value.
  const agentMessageCountKey = `agent_usage_count_${workspaceId}_${agentConfigurationId}`;

  // One sorted set per agent for counting the number of users that have mentioned the agent.
  // score is: timestamp of last usage by a given user
  // value: user_id
  const agentUserCountKey = `agent_user_count_${workspaceId}_${agentConfigurationId}`;

  // One key to store the number of users who have this agent in their list.
  const agentInListCountKey = `agent_in_list_count_${workspaceId}_${agentConfigurationId}`;

  return {
    agentInListCountKey,
    agentMessageCountKey,
    agentUserCountKey,
  };
}

async function signalInRedis({
  agentConfigurationId,
  workspaceId,
  userId,
  timestamp,
  redis,
}: {
  agentConfigurationId: string;
  workspaceId: string;
  userId: string;
  timestamp: number;
  redis: Awaited<ReturnType<typeof redisClient>>;
}) {
  const { agentMessageCountKey, agentUserCountKey } = _getKeys({
    workspaceId,
    agentConfigurationId,
  });

  await redis.zAdd(agentMessageCountKey, {
    score: timestamp,
    value: uuidv4(),
  });
  await redis.expire(agentMessageCountKey, rankingTimeframeSec);

  await redis.zAdd(agentUserCountKey, {
    score: timestamp,
    value: userId,
  });
  await redis.expire(agentUserCountKey, rankingTimeframeSec);
}

async function populateUsageIfNeeded({
  agentConfigurationId,
  workspaceId,
  messageModelId,
  redis,
}: {
  agentConfigurationId: string;
  workspaceId: string;
  messageModelId: ModelId | null;
  redis: Awaited<ReturnType<typeof redisClient>>;
}) {
  const owner = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!owner) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const { agentMessageCountKey, agentUserCountKey } = _getKeys({
    agentConfigurationId,
    workspaceId,
  });

  const existCount = await redis.exists([
    agentMessageCountKey,
    agentUserCountKey,
  ]);
  if (existCount === 0) {
    // Sorted sets for this agent usage do not exist, we'll populate them
    // by fetching the data from the database.
    // We need to ensure that only one process is going through the populate code path
    // so we are using redis.incr() to act as a non blocking lock.
    const populateLockKey = `agent_usage_populate_${workspaceId}_${agentConfigurationId}`;
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
    // Get all mentions for this agent that have a messageId smaller than messageId
    // and that happened within the last 30 days.
    const mentions = await Mention.findAll({
      where: {
        ...{
          agentConfigurationId: agentConfigurationId,
          createdAt: {
            [Op.gt]: literal(`NOW() - INTERVAL '30 days'`),
          },
        },
        ...(messageModelId ? { messageId: { [Op.lt]: messageModelId } } : {}),
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
            {
              model: DBConversation,
              as: "conversation",
              required: true,
              where: {
                workspaceId: owner.id,
              },
            },
          ],
        },
      ],
    });
    for (const mention of mentions) {
      // No need to promise.all() here, as one Redis connection can only execute one command
      // at a time.
      if (mention.message?.userMessage) {
        await signalInRedis({
          agentConfigurationId,
          workspaceId,
          userId:
            mention.message.userMessage.userId?.toString() ||
            mention.message.userMessage.userContextEmail ||
            mention.message.userMessage.userContextUsername,
          timestamp: mention.createdAt.getTime(),
          redis,
        });
      }
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
  const { agentInListCountKey } = _getKeys({
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

  const { agentMessageCountKey, agentUserCountKey } = _getKeys({
    agentConfigurationId,
    workspaceId,
  });

  try {
    redis = providedRedis ?? (await redisClient());
    await populateUsageIfNeeded({
      agentConfigurationId,
      workspaceId,
      messageModelId: null,
      redis,
    });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 1000 * rankingTimeframeSec);
    const messageCount = await redis.zCount(
      agentMessageCountKey,
      thirtyDaysAgo.getTime(),
      now.getTime()
    );
    const userCount = await redis.zCount(
      agentUserCountKey,
      thirtyDaysAgo.getTime(),
      now.getTime()
    );
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

export async function signalAgentUsage({
  agentConfigurationId,
  workspaceId,
  userId,
  timestamp,
  messageModelId,
}: {
  agentConfigurationId: string;
  workspaceId: string;
  userId: string;
  timestamp: number;
  messageModelId: ModelId;
}) {
  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;
  try {
    redis = await redisClient();
    await populateUsageIfNeeded({
      agentConfigurationId,
      workspaceId,
      messageModelId,
      redis,
    });
    await signalInRedis({
      agentConfigurationId,
      workspaceId,
      userId,
      timestamp,
      redis,
    });
  } finally {
    if (redis) {
      await redis.quit();
    }
  }
}
