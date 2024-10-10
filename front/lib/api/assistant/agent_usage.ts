import type { AgentConfigurationType } from "@dust-tt/types";
import type { RedisClientType } from "redis";
import { literal, Op, Sequelize } from "sequelize";

import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import {
  Conversation,
  Mention,
  Message,
} from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import { launchMentionsCountWorkflow } from "@app/temporal/mentions_count_queue/client";

// Ranking of agents is done over a 30 days period.
const rankingUsageDays = 30;
const rankingTimeframeSec = 60 * 60 * 24 * rankingUsageDays;

const MENTION_COUNT_TTL = 60 * 60 * 24 * 7; // 7 days

// Computing agent mention count over a 4h period
const MENTION_COUNT_UPDATE_PERIOD_SEC = 4 * 60 * 60;

const TTL_KEY_NOT_EXIST = -2;
const TTL_KEY_NOT_SET = -1;

type AgentUsageCount = {
  agentId: string;
  messageCount: number;
  timePeriodSec: number;
};

type mentionCount = {
  agentId: string;
  count: number;
  timePeriodSec: number;
};

function _getUsageKey(workspaceId: string) {
  // One hash per workspace with keys the agent id and value the corresponding
  // number of mentions
  return `agent_usage_count_${workspaceId}`;
}

export async function getAgentsUsage({
  workspaceId,
  providedRedis,
  limit,
}: {
  workspaceId: string;
  providedRedis?: RedisClientType;
  limit?: number;
}): Promise<AgentUsageCount[]> {
  const owner = await Workspace.findOne({ where: { sId: workspaceId } });
  if (!owner) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  let redis: RedisClientType | null = null;

  const agentMessageCountKey = _getUsageKey(workspaceId);

  redis = providedRedis ?? (await getRedisClient({ origin: "agent_usage" }));
  const agentMessageCountTTL = await redis.ttl(agentMessageCountKey);

  // agent mention count doesn't exist or wasn't set to expire
  if (
    agentMessageCountTTL === TTL_KEY_NOT_EXIST ||
    agentMessageCountTTL === TTL_KEY_NOT_SET
  ) {
    await launchMentionsCountWorkflow({ workspaceId });
    return [];
    // agent mention count is stale
  } else if (
    agentMessageCountTTL <
    MENTION_COUNT_TTL - MENTION_COUNT_UPDATE_PERIOD_SEC
  ) {
    await launchMentionsCountWorkflow({ workspaceId });
  }

  // Retrieve and parse agents usage
  const agentsUsage = await redis.hGetAll(agentMessageCountKey);
  return Object.entries(agentsUsage)
    .map(([agentId, count]) => ({
      agentId,
      messageCount: parseInt(count),
      timePeriodSec: rankingTimeframeSec,
    }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, limit);
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
    providedRedis?: RedisClientType;
  }
): Promise<AgentUsageCount | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call");
  }
  if (owner.sId !== workspaceId) {
    throw new Error("Provided workspace and owner workspace do not match.");
  }

  let redis: RedisClientType | null = null;
  const { sId: agentConfigurationId } = agentConfiguration;

  const agentMessageCountKey = _getUsageKey(workspaceId);

  redis = providedRedis ?? (await getRedisClient({ origin: "agent_usage" }));

  const agentUsage = await redis.hGet(
    agentMessageCountKey,
    agentConfigurationId
  );
  return agentUsage
    ? {
        agentId: agentConfigurationId,
        messageCount: parseInt(agentUsage, 10),
        timePeriodSec: rankingTimeframeSec,
      }
    : null;
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
      workspaceId,
    },
    include: [
      {
        model: Message,
        required: true,
        attributes: [],
        where: {
          createdAt: {
            [Op.gt]: literal(`NOW() - INTERVAL '${rankingUsageDays} days'`),
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
  redis: RedisClientType
) {
  const transaction = redis.multi();
  const agentMessageCountKey = _getUsageKey(workspaceId);

  agentMessageCounts.forEach(({ agentId, count }) => {
    transaction.hSet(agentMessageCountKey, agentId, count);
  });
  transaction.expire(agentMessageCountKey, MENTION_COUNT_TTL);

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
  let redis: RedisClientType | null = null;

  redis = await getRedisClient({ origin: "agent_usage" });
  const agentMessageCountKey = _getUsageKey(workspaceId);
  const agentMessageCountTTL = await redis.ttl(agentMessageCountKey);

  if (agentMessageCountTTL !== TTL_KEY_NOT_EXIST) {
    // We only want to increment if the counts have already been computed
    await redis.hIncrBy(agentMessageCountKey, agentConfigurationId, 1);
  }
}
