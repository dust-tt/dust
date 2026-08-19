import { INTERACTIVE_CONTENT_SERVER_NAME } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { RUN_AGENT_SERVER_NAME } from "@app/lib/api/actions/servers/run_agent/metadata";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { USER_USAGE_ORIGINS } from "@app/lib/api/programmatic_usage/common";
import { TOOL_COST_CATEGORY_AWU_WEIGHTS } from "@app/lib/metronome/events";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import chunk from "lodash/chunk";

// ---------------------------------------------------------------------------
// Elasticsearch query: per-(user, day) activity facts.
// ---------------------------------------------------------------------------
//
// One composite aggregation over agent_message_analytics_2 returning, per
// (user, day): whether the user was a daily active user, and whether they had a
// high-value use case signal (≥1 succeeded tool call that is either
// advanced-cost, a frame touch (interactive_content), or run_agent).

// Origins that make a day count as a daily active user day: human-initiated
// organic ("user") origins, with `triggered` deliberately EXCLUDED.
const DAILY_ACTIVE_USER_ORIGINS = USER_USAGE_ORIGINS.filter(
  (origin) => origin !== "triggered"
);

// Hard cap on users per Elasticsearch call. Larger sets are fetched in
// sequential batches. The composite page size is sized so that the entire
// (user × day) grid fits in a single page for a capped user set, making the
// pagination loop complete by construction (see below).
const ELASTICSEARCH_MAX_USERS_PER_CALL = 100;
// Upper bound on distinct day-buckets a single user can produce over any
// trailing window of up to ~one month.
const MAX_DISTINCT_DAYS_PER_USER = 31;
const COMPOSITE_PAGE_SIZE =
  ELASTICSEARCH_MAX_USERS_PER_CALL * MAX_DISTINCT_DAYS_PER_USER;
// One page always suffices for a capped user set; the 2nd iteration only drains
// the trailing empty after_key round trip.
const MAX_COMPOSITE_PAGES = 2;

interface FilterAggBucket {
  doc_count: number;
}

interface CompositeDayBucket {
  key: { user_id: string; day: number };
  doc_count: number;
  dau?: FilterAggBucket;
  hvuc_signal?: FilterAggBucket;
}

interface UserDayCellsAggs {
  by_user_day?: {
    after_key?: { user_id: string; day: number };
    buckets: CompositeDayBucket[];
  };
}

/**
 * Raw per-(user, day) activity facts. The day/week thresholds are applied by the
 * evaluator — this shape carries facts only.
 */
interface UserDayFact {
  userId: string;
  // Epoch millis at the start of the UTC day.
  dayMs: number;
  isDau: boolean;
  // ≥1 succeeded advanced-cost tool call, frame touch, or run_agent that day.
  isHvuc: boolean;
}

function bucketToFact(bucket: CompositeDayBucket): UserDayFact {
  return {
    userId: bucket.key.user_id,
    dayMs: bucket.key.day,
    isDau: (bucket.dau?.doc_count ?? 0) > 0,
    isHvuc: (bucket.hvuc_signal?.doc_count ?? 0) > 0,
  };
}

/**
 * Fetches per-(user, day) activity facts for the given users over
 * [windowStart, windowEnd), keyed by user sId. Elasticsearch composite
 * aggregations are capped at ELASTICSEARCH_MAX_USERS_PER_CALL so the
 * (user × day) grid fits in a single page; larger sets are fetched in
 * batches and merged.
 */
export async function fetchUserDayCells({
  workspaceId,
  userIds,
  windowStart,
  windowEnd,
}: {
  workspaceId: string;
  userIds: string[];
  windowStart: Date;
  windowEnd: Date;
}): Promise<Result<Map<string, UserDayFact[]>, Error>> {
  const uniqueUserIds = [...new Set(userIds)];

  const factsByUser = new Map<string, UserDayFact[]>();
  if (uniqueUserIds.length === 0) {
    return new Ok(factsByUser);
  }

  const batches = chunk(uniqueUserIds, ELASTICSEARCH_MAX_USERS_PER_CALL);
  for (const batch of batches) {
    const batchResult = await fetchUserDayCellsBatch({
      workspaceId,
      userIds: batch,
      windowStart,
      windowEnd,
    });
    if (batchResult.isErr()) {
      return batchResult;
    }
    for (const [userId, facts] of batchResult.value) {
      factsByUser.set(userId, facts);
    }
  }

  return new Ok(factsByUser);
}

async function fetchUserDayCellsBatch({
  workspaceId,
  userIds,
  windowStart,
  windowEnd,
}: {
  workspaceId: string;
  userIds: string[];
  windowStart: Date;
  windowEnd: Date;
}): Promise<Result<Map<string, UserDayFact[]>, Error>> {
  const factsByUser = new Map<string, UserDayFact[]>();
  for (const userId of userIds) {
    factsByUser.set(userId, []);
  }

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        // Reuse the workspace-scoped analytics query so this aggregation can
        // never search documents from another workspace.
        buildAgentAnalyticsBaseQuery({
          workspaceId,
          userIds,
          // Include only known human/user origins rather than excluding
          // programmatic ones with a costly must_not clause.
          contextOrigin: USER_USAGE_ORIGINS,
        }),
        {
          range: {
            timestamp: {
              gte: windowStart.toISOString(),
              lt: windowEnd.toISOString(),
            },
          },
        },
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
      ],
    },
  };

  // HVUC signal: ≥1 succeeded tool call that is advanced-cost, a frame touch, or
  // run_agent.
  const hvucNestedQuery: estypes.QueryDslQueryContainer = {
    nested: {
      path: "tools_used",
      query: {
        bool: {
          filter: [{ term: { "tools_used.status": "succeeded" } }],
          should: [
            {
              range: {
                "tools_used.cost_awu": {
                  gte: TOOL_COST_CATEGORY_AWU_WEIGHTS.advanced,
                },
              },
            },
            {
              term: {
                "tools_used.server_name": INTERACTIVE_CONTENT_SERVER_NAME,
              },
            },
            {
              term: {
                "tools_used.server_name": RUN_AGENT_SERVER_NAME,
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
    },
  };

  let afterKey: { user_id: string; day: number } | undefined;
  for (let page = 0; page < MAX_COMPOSITE_PAGES; page++) {
    const composite: estypes.AggregationsCompositeAggregation = {
      size: COMPOSITE_PAGE_SIZE,
      sources: [
        { user_id: { terms: { field: "user_id" } } },
        {
          day: {
            date_histogram: {
              field: "timestamp",
              calendar_interval: "1d",
              time_zone: "UTC",
            },
          },
        },
      ],
      ...(afterKey ? { after: afterKey } : {}),
    };

    const result = await searchAnalytics<never, UserDayCellsAggs>(query, {
      size: 0,
      aggregations: {
        by_user_day: {
          composite,
          aggregations: {
            dau: {
              filter: {
                terms: { context_origin: DAILY_ACTIVE_USER_ORIGINS },
              },
            },
            hvuc_signal: { filter: hvucNestedQuery },
          },
        },
      },
    });

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const agg = result.value.aggregations?.by_user_day;
    const buckets = agg?.buckets ?? [];
    for (const bucket of buckets) {
      const userFacts = factsByUser.get(bucket.key.user_id);
      if (!userFacts) {
        continue;
      }
      userFacts.push(bucketToFact(bucket));
    }

    afterKey = agg?.after_key;
    if (!afterKey || buckets.length === 0) {
      break;
    }
  }

  return new Ok(factsByUser);
}
