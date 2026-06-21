import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import {
  fetchAgentCostStats,
  getAgentCostStats,
} from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { WorkspaceTopAgentRow } from "@app/lib/api/workspace/analytics";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type TopAgentBucket = {
  key: string;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

type TopAgentsAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<TopAgentBucket>;
};

// Ranks agents by message count over a time window, with unique-user counts and
// name/picture resolution. Backs both the top-agents analytics endpoint and the
// workspace_analytics get_top_agents tool. Either `days` or `startDate`/`endDate`
// bounds the window; the source/agent/user filters are optional.
export async function fetchTopAgents(
  auth: Authenticator,
  {
    days,
    startDate,
    endDate,
    limit,
    contextOrigin,
    agentIds,
    userIds,
  }: {
    days?: number;
    startDate?: string;
    endDate?: string;
    limit: number;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
  }
): Promise<Result<WorkspaceTopAgentRow[], ElasticsearchError>> {
  const owner = auth.getNonNullableWorkspace();

  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: owner.sId,
    days,
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
  });

  const result = await searchAnalytics<never, TopAgentsAggs>(
    {
      bool: {
        filter: [baseQuery, { exists: { field: "agent_id" } }],
      },
    },
    {
      aggregations: {
        by_agent: {
          terms: { field: "agent_id", size: limit },
          aggs: {
            unique_users: { cardinality: { field: "user_id" } },
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<TopAgentBucket>(
    result.value.aggregations?.by_agent?.buckets
  );

  const bucketAgentIds = buckets.map((bucket) => String(bucket.key));
  if (bucketAgentIds.length === 0) {
    return new Ok([]);
  }

  const [agents, costStatsResult] = await Promise.all([
    getAgentConfigurations(auth, {
      agentIds: bucketAgentIds,
      variant: "extra_light",
    }),
    fetchAgentCostStats(auth, {
      agentIds: bucketAgentIds,
      days,
      startDate,
      endDate,
    }),
  ]);

  if (costStatsResult.isErr()) {
    return costStatsResult;
  }
  const costStatsMap = costStatsResult.value;

  const agentsById = new Map(agents.map((agent) => [agent.sId, agent]));

  const rows = buckets.map((bucket) => {
    const agentId = String(bucket.key);
    const agent = agentsById.get(agentId);
    return {
      agentId,
      name: agent?.name ?? "Unknown agent",
      pictureUrl: agent?.pictureUrl ?? null,
      messageCount: bucket.doc_count ?? 0,
      userCount: Math.round(bucket.unique_users?.value ?? 0),
      totalCostCredits: getAgentCostStats(costStatsMap, agentId)
        .totalCostCredits,
    };
  });

  return new Ok(rows);
}
