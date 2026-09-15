import {
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  ElasticsearchError,
  withEs,
} from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { getRedisCacheClient } from "@app/lib/api/redis";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";
import { z } from "zod";

export const SEARCH_USAGE_WINDOW_DAYS = 30;
const USAGE_BUCKET_PAGE_SIZE = 500;
const USAGE_SNAPSHOT_TTL_SECONDS = 48 * 60 * 60;
const ActiveUsersSchema = z.record(z.string(), z.number().int().nonnegative());

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
export async function fetchSearchActiveUsers({
  workspaceId,
  evaluatedAtMs,
}: {
  workspaceId: string;
  evaluatedAtMs: number;
}): Promise<Result<Record<string, number>, ElasticsearchError>> {
  assert(workspaceId.length > 0);
  assert(Number.isFinite(evaluatedAtMs));
  const end = new Date(evaluatedAtMs);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - SEARCH_USAGE_WINDOW_DAYS);
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { terms: { context_origin: USER_USAGE_ORIGINS } },
        { exists: { field: CONSUMPTION_DIMENSION_FIELDS.user } },
        {
          range: {
            [COMPLETED_AT_FIELD]: {
              gte: start.toISOString(),
              lt: end.toISOString(),
            },
          },
        },
      ],
    },
  };
  const counts: Record<string, number> = {};
  let after: { resource_id: string } | undefined;
  do {
    const page = await withEs((client) =>
      client.search<never, UsageAggregations>({
        index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
        query,
        size: 0,
        allow_partial_search_results: false,
        aggs: {
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
      })
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

// Ranking-only data; current registry and ACL checks still determine eligibility.
export async function storeCodeDefinedSkillActiveUsers(
  workspaceId: string,
  counts: Record<string, number>
): Promise<void> {
  const redis = await getRedisCacheClient({ origin: "search_usage_snapshot" });
  await redis.set(
    `search_usage_snapshot:skill:${workspaceId}`,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(counts).filter(([id]) => !id.startsWith("skl_"))
      )
    ),
    { EX: USAGE_SNAPSHOT_TTL_SECONDS }
  );
}

export async function readCodeDefinedSkillActiveUsers(
  workspaceId: string
): Promise<Record<string, number>> {
  const redis = await getRedisCacheClient({ origin: "search_usage_snapshot" });
  const raw = await redis.get(`search_usage_snapshot:skill:${workspaceId}`);
  if (!raw) {
    return {};
  }
  const json = safeParseJSON(raw);
  if (json.isErr()) {
    return {};
  }
  const parsed = ActiveUsersSchema.safeParse(json.value);
  return parsed.success ? parsed.data : {};
}
