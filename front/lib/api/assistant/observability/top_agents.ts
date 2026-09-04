import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
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

type WorkspaceTopAgentRow = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  messageCount: number;
  userCount: number;
};

// Ranks agents by message count over a time window, with unique-user counts and
// name/picture resolution. Backs the workspace_analytics get_top_agents tool.
// Either `days` or `startDate`/`endDate` bounds the window; the
// source/agent/user/model filters are optional.
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
    agentTagIds,
    modelIds,
  }: {
    days?: number;
    startDate?: string;
    endDate?: string;
    limit: number;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
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
    agentTagIds,
    modelIds,
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

  const agents = await resolveAnalyticsAgentLabels(auth, bucketAgentIds);

  const rows = buckets.flatMap((bucket) => {
    const agentId = String(bucket.key);
    const label = agents.get(agentId);
    if (!label) {
      return [];
    }
    return [
      {
        agentId,
        name: label.name,
        pictureUrl: label.pictureUrl,
        messageCount: bucket.doc_count ?? 0,
        userCount: Math.round(bucket.unique_users?.value ?? 0),
      },
    ];
  });

  return new Ok(rows);
}
