import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type TopTagRow = {
  tagId: string;
  name: string;
  messageCount: number;
  agentCount: number;
};

type TopTagBucket = {
  key: string;
  doc_count: number;
  unique_agents?: estypes.AggregationsCardinalityAggregate;
};

type TopTagsAggs = {
  by_tag?: estypes.AggregationsMultiBucketAggregateBase<TopTagBucket>;
};

// Ranks agent tags by message count over a time window, with the count of
// distinct agents carrying each tag.
// Backs the top-tags analytics endpoint.
// Either `days` or `startDate`/`endDate` bounds the window; source/agent/user
// filters are optional.
// Since agents can have multiple tags, counts overlap and can sum to more than
// the total message volume.
export async function fetchTopTags(
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
  }: {
    days?: number;
    startDate?: string;
    endDate?: string;
    limit: number;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    agentTagIds?: string[];
  }
): Promise<Result<TopTagRow[], ElasticsearchError>> {
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
  });

  const result = await searchAnalytics<never, TopTagsAggs>(
    {
      bool: {
        filter: [baseQuery, { exists: { field: "agent_tag_ids" } }],
      },
    },
    {
      aggregations: {
        by_tag: {
          terms: { field: "agent_tag_ids", size: limit },
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

  const buckets = bucketsToArray<TopTagBucket>(
    result.value.aggregations?.by_tag?.buckets
  );

  const tagIds = buckets.map((bucket) => String(bucket.key));
  if (tagIds.length === 0) {
    return new Ok([]);
  }

  const tags = await TagResource.fetchByIds(auth, tagIds);
  const nameById = new Map(tags.map((tag) => [tag.sId, tag.name]));

  const rows = buckets.map((bucket) => {
    const tagId = String(bucket.key);
    return {
      tagId,
      // A tag may have been deleted after messages were indexed; fall back to
      // the raw id so the row is still actionable.
      name: nameById.get(tagId) ?? tagId,
      messageCount: bucket.doc_count ?? 0,
      agentCount: Math.round(bucket.unique_agents?.value ?? 0),
    };
  });

  return new Ok(rows);
}
