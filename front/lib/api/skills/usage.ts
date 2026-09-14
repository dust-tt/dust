import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
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
 * @cc [owner:aubin-tchoi,label:product] skill-enablement-filters
 * Selects skill enablement events. Query scoping and aggregation are the caller's responsibility.
 */
export function buildSkillEnablementFilters(): estypes.QueryDslQueryContainer[] {
  return [
    { term: { consumption_type: "tool" } },
    { term: { "tool.name": ENABLE_SKILL_TOOL_NAME } },
    { term: { "tool.server_name": SKILL_MANAGEMENT_SERVER_NAME } },
  ];
}

/**
 * @cc [owner:aubin-tchoi,label:product] recent-skill-usage
 * Counts the number of times each requested skill has been enabled in the authenticated workspace
 * within [period.startDate, period.endDate). Skills with no enablements in that period are absent
 * from the map.
 */
export async function fetchSkillUsageCounts(
  auth: Authenticator,
  { skillIds, period }: { skillIds: string[]; period: ConsumptionPeriod }
): Promise<Result<Map<string, number>, ElasticsearchError>> {
  if (skillIds.length === 0) {
    return new Ok(new Map());
  }

  const query = buildConsumptionScopeQuery({
    auth,
    startDate: period.startDate,
    endDate: period.endDate,
    filter: { skills: skillIds },
    extraFilters: buildSkillEnablementFilters(),
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
