import {
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONVERSATION_ID_FIELD,
  uniqueMessagesCardinalityAgg,
} from "@app/lib/api/analytics/consumption/scope";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { getRedisStreamClient } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getAssistantUsageData } from "@app/lib/workspace_usage";
import { launchMentionsCountWorkflow } from "@app/temporal/mentions_count_queue/client";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { estypes } from "@elastic/elasticsearch";
import keyBy from "lodash/keyBy";
import type { RedisClientType } from "redis";

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

  redis =
    providedRedis ?? (await getRedisStreamClient({ origin: "agent_usage" }));
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
    message_count?: estypes.AggregationsCardinalityAggregate;
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
    { exists: { field: CONSUMPTION_DIMENSION_FIELDS.agent } },
    {
      range: {
        [COMPLETED_AT_FIELD]: {
          gte: `now-${rankingUsageDays}d/d`,
        },
      },
    },
  ];

  if (agentConfiguration) {
    filters.push({
      term: {
        [CONSUMPTION_DIMENSION_FIELDS.agent]: agentConfiguration.sId,
      },
    });
  }

  const query: estypes.QueryDslQueryContainer = {
    bool: { filter: filters },
  };

  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      by_agent: {
        terms: {
          field: CONSUMPTION_DIMENSION_FIELDS.agent,
          size: 1000,
          order: { message_count: "desc" },
        },
        aggs: {
          message_count: uniqueMessagesCardinalityAgg(),
          conversation_count: {
            cardinality: {
              field: CONVERSATION_ID_FIELD,
              precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
            },
          },
          user_count: {
            cardinality: {
              field: CONSUMPTION_DIMENSION_FIELDS.user,
              precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
            },
          },
        },
      },
    };

  const result = await searchConsumptionAnalytics<never, MentionsCountAggs>(
    query,
    {
      aggregations,
      size: 0,
    }
  );

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
        messageCount: Math.round(bucket.message_count?.value ?? 0),
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
  const amcByAgentId = keyBy(agentMessageCounts, "agentId");

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

  redis = await getRedisStreamClient({ origin: "agent_usage" });
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
