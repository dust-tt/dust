import type {
  AgentUsageType,
  LightAgentConfigurationType,
  ModelId,
  WorkspaceType,
} from "@dust-tt/types";
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
import { AgentUserRelation } from "@app/lib/models/assistant/agent";
import { redisClient } from "@app/lib/redis";

// Ranking of agents is done over a 30 days period.
const rankingTimeframeSec = 60 * 60 * 24 * 30; // 30 days

function _getKeys({
  workspaceSId,
  agentConfigurationSId,
}: {
  workspaceSId: string;
  agentConfigurationSId: string;
}) {
  // One sorted set per agent for counting the number of messages from the agent.
  // score is: timestamp of each message of the agent
  // value: random unique distinct value.
  const agentMessageCountKey = `agent_usage_count_${workspaceSId}_${agentConfigurationSId}`;

  // One sorted set per agent for counting the number of users that have mentioned the agent.
  // score is: timestamp of last usage by a given user
  // value: user_id
  const agentUserCountKey = `agent_user_count_${workspaceSId}_${agentConfigurationSId}`;
  return {
    agentMessageCountKey,
    agentUserCountKey,
  };
}

async function signalInRedis({
  agentConfigurationSId,
  workspaceSId,
  userId,
  timestamp,
  redis,
}: {
  agentConfigurationSId: string;
  workspaceSId: string;
  userId: string;
  timestamp: number;
  redis: Awaited<ReturnType<typeof redisClient>>;
}) {
  const { agentMessageCountKey, agentUserCountKey } = _getKeys({
    workspaceSId,
    agentConfigurationSId,
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
  agentConfigurationSId,
  workspaceSId,
  messageId,
  redis,
}: {
  agentConfigurationSId: string;
  workspaceSId: string;
  messageId: ModelId | null;
  redis: Awaited<ReturnType<typeof redisClient>>;
}) {
  const owner = await Workspace.findOne({
    where: {
      sId: workspaceSId,
    },
  });
  if (!owner) {
    throw new Error(`Workspace ${workspaceSId} not found`);
  }
  const { agentMessageCountKey, agentUserCountKey } = _getKeys({
    agentConfigurationSId,
    workspaceSId,
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
    const populateLockKey = `agent_usage_populate_${workspaceSId}_${agentConfigurationSId}`;
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
          agentConfigurationSId: agentConfigurationSId,
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
            {
              model: DBConversation,
              as: "conversation",
              required: true,
              where: {
                workspaceSId: owner.id,
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
          agentConfigurationSId,
          workspaceSId,
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

// Consider moving this to Redis if it's really slow.
async function getAgentInListCount(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType
) {
  if (agentConfiguration.scope === "published") {
    return getUsersWithAgentInListCount(auth, agentConfiguration.sId);
  } else {
    return getMembersCount(auth, { activeOnly: true });
  }
}

export async function getAgentUsage(
  auth: Authenticator,
  {
    workspaceSId,
    agentConfiguration,
    providedRedis,
  }: {
    workspaceSId: string;
    agentConfiguration: LightAgentConfigurationType;
    providedRedis?: Awaited<ReturnType<typeof redisClient>>;
  }
): Promise<AgentUsageType> {
  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;
  const { sId: agentConfigurationSId } = agentConfiguration;

  const { agentMessageCountKey, agentUserCountKey } = _getKeys({
    agentConfigurationSId,
    workspaceSId,
  });

  try {
    redis = providedRedis ?? (await redisClient());
    await populateUsageIfNeeded({
      agentConfigurationSId,
      workspaceSId,
      messageId: null,
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
  agentConfigurationSId,
  workspaceSId,
  userId,
  timestamp,
  messageId,
}: {
  agentConfigurationSId: string;
  workspaceSId: string;
  userId: string;
  timestamp: number;
  messageId: ModelId;
}) {
  let redis: Awaited<ReturnType<typeof redisClient>> | null = null;
  try {
    redis = await redisClient();
    await populateUsageIfNeeded({
      agentConfigurationSId,
      workspaceSId,
      messageId,
      redis,
    });
    await signalInRedis({
      agentConfigurationSId,
      workspaceSId,
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
