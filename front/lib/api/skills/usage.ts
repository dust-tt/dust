import {
  buildConsumptionScopeQuery,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type SkillUsageBucket = { key: string; doc_count: number };

type SkillUsageAggregations = {
  by_skill?: estypes.AggregationsMultiBucketAggregateBase<SkillUsageBucket>;
};

/**
 * @cc [owner:aubin-tchoi,label:product] recent-skill-usage
 * Counts indexed tool calls attributed to each requested skill in the authenticated workspace
 * over the last 30 days, including skill activations; skills without calls are absent from the map.
 */
export async function fetchSkillUsageCounts(
  auth: Authenticator,
  skillIds: string[]
): Promise<Result<Map<string, number>, ElasticsearchError>> {
  if (skillIds.length === 0) {
    return new Ok(new Map());
  }

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: "now-30d",
    endDate: "now",
    filter: { skills: skillIds },
    extraFilters: [{ term: { consumption_type: "tool" } }],
  });
  const result = await searchConsumptionAnalytics<
    never,
    SkillUsageAggregations
  >(query, {
    size: 0,
    aggregations: {
      by_skill: {
        terms: {
          field: CONSUMPTION_DIMENSION_FIELDS.skill,
          include: skillIds,
          size: skillIds.length,
        },
      },
    },
  });
  if (result.isErr()) {
    return result;
  }

  const buckets = bucketsToArray<SkillUsageBucket>(
    result.value.aggregations?.by_skill?.buckets
  );
  return new Ok(
    new Map(buckets.map((bucket) => [bucket.key, bucket.doc_count]))
  );
}
