import type { WorkspaceTopUserRow } from "@app/lib/api/analytics/workspace_analytics";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type TopUserBucket = {
  key: string;
  doc_count: number;
  unique_agents?: estypes.AggregationsCardinalityAggregate;
};

type TopUsersAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<TopUserBucket>;
};

function getUserDisplayName(user: UserResource | undefined): string {
  if (!user) {
    return "Programmatic usage";
  }
  const fullName = user.fullName();
  if (fullName) {
    return fullName;
  }
  if (user.username) {
    return user.username;
  }
  return user.email || "Programmatic usage";
}

export async function fetchTopUsers(
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
): Promise<Result<WorkspaceTopUserRow[], ElasticsearchError>> {
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

  const result = await searchAnalytics<never, TopUsersAggs>(
    {
      bool: {
        filter: [baseQuery, { exists: { field: "user_id" } }],
      },
    },
    {
      aggregations: {
        by_user: {
          terms: { field: "user_id", size: limit },
          aggs: {
            unique_agents: { cardinality: { field: "agent_id" } },
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<TopUserBucket>(
    result.value.aggregations?.by_user?.buckets
  );

  const bucketUserIds = buckets.map((bucket) => String(bucket.key));
  const users =
    bucketUserIds.length > 0
      ? await UserResource.fetchByIds(bucketUserIds)
      : [];
  const usersById = new Map(users.map((user) => [user.sId, user]));

  const rows = buckets.map((bucket) => {
    const userId = String(bucket.key);
    const user = usersById.get(userId);
    return {
      userId,
      name: getUserDisplayName(user),
      imageUrl: user?.imageUrl ?? null,
      messageCount: bucket.doc_count ?? 0,
      agentCount: Math.round(bucket.unique_agents?.value ?? 0),
    };
  });

  return new Ok(rows);
}
