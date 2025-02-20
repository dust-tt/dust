import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import _ from "lodash";
import type { RedisClientType } from "redis";
import { literal, Op, QueryTypes, Sequelize } from "sequelize";

import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import {
  Conversation,
  Mention,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { getAssistantUsageData } from "@app/lib/workspace_usage";
import { launchMentionsCountWorkflow } from "@app/temporal/mentions_count_queue/client";

// Ranking of agents is done over a 30 days period.
const RANKING_USAGE_DAYS = 30;
const RANKING_TIMEFRAME_SEC = 60 * 60 * 24 * RANKING_USAGE_DAYS;

const MENTION_COUNT_TTL = 60 * 60 * 24 * 7; // 7 days

// Computing agent mention count over a 4h period
const MENTION_COUNT_UPDATE_PERIOD_SEC = 4 * 60 * 60;

const TTL_KEY_NOT_EXIST = -2;
const TTL_KEY_NOT_SET = -1;

type AgentUsageCount = {
  agentId: string;
  messageCount: number;
  conversationCount: number;
  userCount: number;
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
    .map(([agentId, value]) => {
      const parsed = JSON.parse(value);
      return {
        agentId,
        conversationCount: 0,
        userCount: 0,
        ...(typeof parsed === "object" ? parsed : { messageCount: parsed }),
        timePeriodSec: RANKING_TIMEFRAME_SEC,
      };
    })
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, limit);
}

export async function getAgentUsage(
  auth: Authenticator,
  {
    workspaceId,
    agentConfiguration,
    rankingUsageDays = RANKING_USAGE_DAYS,
  }: {
    workspaceId: string;
    agentConfiguration: AgentConfigurationType;
    providedRedis?: RedisClientType;
    rankingUsageDays?: number;
  }
): Promise<AgentUsageCount | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call");
  }
  if (owner.sId !== workspaceId) {
    throw new Error("Provided workspace and owner workspace do not match.");
  }

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - rankingUsageDays);

  const agentUsage = await getAssistantUsageData(
    start,
    end,
    owner,
    agentConfiguration
  );

  return agentUsage
    ? {
        agentId: agentConfiguration.sId,
        messageCount: agentUsage,
        conversationCount: 0,
        userCount: 0,
        timePeriodSec: RANKING_TIMEFRAME_SEC,
      }
    : null;
}

export async function agentMentionsCount(
  workspaceId: number,
  agentConfiguration?: LightAgentConfigurationType,
  rankingUsageDays: number = RANKING_USAGE_DAYS
): Promise<AgentUsageCount[]> {
  const readReplica = getFrontReplicaDbConnection();

  if (typeof rankingUsageDays !== "number") {
    // Prevent SQL injection
    throw new Error("Invalid ranking usage days");
  }

  const mentions = await readReplica.query(
    `
    WITH message_counts AS (
      SELECT 
        mentions."agentConfigurationId",
        COUNT(DISTINCT mentions.id) as message_count,
        COUNT(DISTINCT c.id) as conversation_count, 
        COUNT(DISTINCT um."userId") as user_count
      FROM conversations c
      INNER JOIN messages m ON m."conversationId" = c.id 
      INNER JOIN mentions ON mentions."messageId" = m.id
      INNER JOIN user_messages um ON um.id = m."userMessageId"
      WHERE 
        c."workspaceId" = :workspaceId
        AND mentions."workspaceId" = :workspaceId
        AND mentions."createdAt" > NOW() - INTERVAL '${rankingUsageDays} days'
        AND ((:agentConfigurationId)::VARCHAR IS NULL OR mentions."agentConfigurationId" = :agentConfigurationId)
      GROUP BY mentions."agentConfigurationId"
      ORDER BY message_count DESC
    )
    SELECT 
      "agentConfigurationId",
      message_count as "messageCount",
      conversation_count as "conversationCount",
      user_count as "userCount"
    FROM message_counts;
    `,
    {
      replacements: {
        workspaceId,
        agentConfigurationId: agentConfiguration?.sId ?? null,
      },
      type: QueryTypes.SELECT,
    }
  );

  return mentions.map((mention) => {
    const castMention = mention as unknown as {
      agentConfigurationId: string;
      messageCount: number;
      conversationCount: number;
      userCount: number;
    };
    return {
      agentId: castMention.agentConfigurationId,
      messageCount: castMention.messageCount,
      conversationCount: castMention.conversationCount,
      userCount: castMention.userCount,
      timePeriodSec: rankingUsageDays * 24 * 60 * 60,
    };
  });
}

export async function storeCountsInRedis(
  workspaceId: string,
  agentMessageCounts: AgentUsageCount[],
  redis: RedisClientType
) {
  const agentMessageCountKey = _getUsageKey(workspaceId);

  // get agent keys that are not in the agentMessageCounts
  const agentKeys = await redis.hKeys(agentMessageCountKey);

  // fill in the missing agent ids, avoiding n^2 complexity
  const amcByAgentId = _.keyBy(agentMessageCounts, "agentId");

  for (const agentId of agentKeys) {
    if (!amcByAgentId[agentId]) {
      amcByAgentId[agentId] = {
        agentId,
        messageCount: 0,
        conversationCount: 0,
        userCount: 0,
        timePeriodSec: RANKING_TIMEFRAME_SEC,
      };
    }
  }

  const transaction = redis.multi();

  Object.values(amcByAgentId).forEach(
    ({ agentId, messageCount, conversationCount, userCount }) => {
      transaction.hSet(
        agentMessageCountKey,
        agentId,
        JSON.stringify({ messageCount, conversationCount, userCount })
      );
    }
  );

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
    const usage = await redis.hGet(agentMessageCountKey, agentConfigurationId);
    if (usage) {
      const value = JSON.parse(usage);
      const newValue =
        typeof value === "object"
          ? { ...value, messageCount: value.messageCount + 1 }
          : {
              messageCount: value + 1,
              conversationCount: 0,
              userCount: 0,
            };

      await redis.hSet(
        agentMessageCountKey,
        agentConfigurationId,
        JSON.stringify(newValue)
      );
    }
  }
}

type UsersUsageCount = {
  userId: number;
  messageCount: number;
  timePeriodSec: number;
};

export async function getAgentUsers(
  owner: LightWorkspaceType,
  agentConfiguration: LightAgentConfigurationType,
  rankingUsageDays: number = RANKING_USAGE_DAYS
): Promise<UsersUsageCount[]> {
  const mentions = await Conversation.findAll({
    attributes: [
      [Sequelize.literal('"messages->userMessage"."userId"'), "userId"],
      [
        Sequelize.fn("COUNT", Sequelize.literal('"messages->mentions"."id"')),
        "count",
      ],
    ],
    where: {
      workspaceId: owner.id,
    },
    include: [
      {
        model: Message,
        required: true,
        attributes: [],
        include: [
          {
            model: Mention,
            as: "mentions",
            required: true,
            attributes: [],
            where: {
              ...(agentConfiguration
                ? { agentConfigurationId: agentConfiguration.sId }
                : {}),
              createdAt: {
                [Op.gt]: literal(`NOW() - INTERVAL '${rankingUsageDays} days'`),
              },
            },
          },
          {
            model: UserMessage,
            as: "userMessage",
            required: true,
            attributes: [],
          },
        ],
      },
    ],
    order: [["count", "DESC"]],
    group: ['"messages->userMessage"."userId"'],
    raw: true,
  });

  return mentions.map((mention) => {
    const castMention = mention as unknown as {
      userId: number;
      count: number;
    };
    return {
      userId: castMention.userId,
      messageCount: castMention.count,
      timePeriodSec: rankingUsageDays * 24 * 60 * 60,
    };
  });
}
