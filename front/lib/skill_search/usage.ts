import {
  buildConsumptionScopeQuery,
  CARDINALITY_PRECISION_THRESHOLD,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import {
  ElasticsearchError,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const SEARCH_USAGE_WINDOW_DAYS = 30;
const USAGE_BUCKET_PAGE_SIZE = 500;

type UsageAggregations = {
  resources: {
    after_key?: { resource_id: string };
    buckets: {
      key: { resource_id: string };
      active_users: { value: number };
    }[];
  };
};

/**
 * @cc [owner:aubin-tchoi,label:backend;performance] search-usage-snapshot
 * Counts distinct human users over the previous 30 complete UTC days using the
 * consumption attribution dimensions; every composite page is workspace-scoped.
 */
export async function fetchSearchActiveUsers(
  auth: Authenticator,
  { evaluatedAtMs }: { evaluatedAtMs: number }
): Promise<Result<Record<string, number>, ElasticsearchError>> {
  const end = new Date(evaluatedAtMs);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - SEARCH_USAGE_WINDOW_DAYS);
  const query = buildConsumptionScopeQuery({
    auth,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    extraFilters: [
      { terms: { context_origin: USER_USAGE_ORIGINS } },
      { exists: { field: CONSUMPTION_DIMENSION_FIELDS.user } },
    ],
  });
  const counts: Record<string, number> = {};
  let after: { resource_id: string } | undefined;
  do {
    const page = await searchConsumptionAnalytics<never, UsageAggregations>(
      query,
      {
        size: 0,
        allow_partial_search_results: false,
        aggregations: {
          resources: {
            composite: {
              size: USAGE_BUCKET_PAGE_SIZE,
              sources: [
                {
                  resource_id: {
                    terms: {
                      field: CONSUMPTION_DIMENSION_FIELDS.skill,
                    },
                  },
                },
              ],
              ...(after ? { after } : {}),
            },
            aggs: {
              active_users: {
                cardinality: {
                  field: CONSUMPTION_DIMENSION_FIELDS.user,
                  precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
                },
              },
            },
          },
        },
      }
    );
    if (page.isErr()) {
      return page;
    }
    const resources = page.value.aggregations?.resources;
    if (
      page.value.timed_out ||
      !resources ||
      !Array.isArray(resources.buckets)
    ) {
      return new Err(
        new ElasticsearchError(
          "query_error",
          "Incomplete search usage snapshot"
        )
      );
    }
    for (const bucket of resources.buckets) {
      counts[bucket.key.resource_id] = Math.round(bucket.active_users.value);
    }
    const next = resources.after_key;
    if (next && next.resource_id === after?.resource_id) {
      return new Err(
        new ElasticsearchError(
          "query_error",
          "Search usage pagination did not advance"
        )
      );
    }
    after = resources.buckets.length > 0 ? next : undefined;
  } while (after);
  return new Ok(counts);
}
