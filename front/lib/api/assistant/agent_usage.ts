import type { estypes } from "@elastic/elasticsearch";
import _ from "lodash";
import type { RedisClientType } from "redis";

import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage_tracking";
import { getRedisClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getAssistantUsageData } from "@app/lib/workspace_usage";
import { launchMentionsCountWorkflow } from "@app/temporal/mentions_count_queue/client";
import type { LightAgentConfigurationType, Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

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
  const owner = await WorkspaceResource.fetchById(workspaceId);
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
    agentConfiguration: LightAgentConfigurationType;
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

type MentionsCountAggs = {
  by_agent: estypes.AggregationsTermsAggregateBase<{
    key: string;
    doc_count: number;
    conversation_count: estypes.AggregationsCardinalityAggregate;
    user_count: estypes.AggregationsCardinalityAggregate;
  }>;
};

export async function agentMentionsCount(
  workspaceId: string,
  agentConfiguration?: LightAgentConfigurationType,
  rankingUsageDays: number = RANKING_USAGE_DAYS
): Promise<Result<AgentUsageCount[], Error>> {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    { terms: { context_origin: USER_USAGE_ORIGINS } },
    { exists: { field: "agent_id" } },
    {
      range: {
        timestamp: {
          gte: `now-${rankingUsageDays}d/d`,
        },
      },
    },
  ];

  if (agentConfiguration) {
    filters.push({ term: { agent_id: agentConfiguration.sId } });
  }

  const query: estypes.QueryDslQueryContainer = {
    bool: { filter: filters },
  };

  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      by_agent: {
        terms: {
          field: "agent_id",
          size: 1000,
        },
        aggs: {
          conversation_count: { cardinality: { field: "conversation_id" } },
          user_count: { cardinality: { field: "user_id" } },
        },
      },
    };

  const result = await searchAnalytics<never, MentionsCountAggs>(query, {
    aggregations,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(
      normalizeError(`Elasticsearch query failed: ${result.error.message}`)
    );
  }

  const buckets = result.value.aggregations?.by_agent?.buckets;
  if (!buckets || !Array.isArray(buckets)) {
    return new Ok([]);
  }

  return new Ok(
    buckets
      .map((bucket) => ({
        agentId: bucket.key,
        messageCount: bucket.doc_count,
        conversationCount: bucket.conversation_count?.value ?? 0,
        userCount: bucket.user_count?.value ?? 0,
        timePeriodSec: rankingUsageDays * 24 * 60 * 60,
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
  );
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

async function getAgentUsers(
  auth: Authenticator,
  agentConfiguration: LightAgentConfigurationType,
  rankingUsageDays: number = RANKING_USAGE_DAYS
): Promise<UsersUsageCount[]> {
  const mentions = await ConversationResource.listMentionsByConfiguration(
    auth,
    {
      agentConfiguration,
      rankingUsageDays,
    }
  );

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
