import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { USAGE_ORIGINS_CLASSIFICATION } from "@app/lib/api/programmatic_usage/common";
import { TOOL_COST_CATEGORY_AWU_WEIGHTS } from "@app/lib/metronome/events";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

// ---------------------------------------------------------------------------
// Elasticsearch query: per-(user, day) activity facts.
// ---------------------------------------------------------------------------
//
// One composite aggregation over agent_message_analytics_2 returning, per
// (user, day): whether the user was a daily active user, and whether they had a
// high-value use case signal (≥1 succeeded tool call that is either
// advanced-cost, a frame touch (interactive_content), or run_agent).

const FRAME_SERVER_NAME = "interactive_content";
const RUN_AGENT_SERVER_NAME = "run_agent";
const TRIGGERED_ORIGIN: UserMessageOrigin = "triggered";

// Programmatic origins are dropped from the query entirely
const PROGRAMMATIC_ORIGINS: UserMessageOrigin[] = (
  Object.keys(USAGE_ORIGINS_CLASSIFICATION) as (keyof typeof USAGE_ORIGINS_CLASSIFICATION)[]
).filter((origin) => USAGE_ORIGINS_CLASSIFICATION[origin] === "programmatic");

// Origins that make a day count as a daily active user day: human-initiated
// organic ("user") origins, with `triggered` deliberately EXCLUDED.
const DAU_ORIGINS: UserMessageOrigin[] = (
  Object.keys(USAGE_ORIGINS_CLASSIFICATION) as (keyof typeof USAGE_ORIGINS_CLASSIFICATION)[]
).filter(
  (origin) =>
    USAGE_ORIGINS_CLASSIFICATION[origin] === "user" &&
    origin !== TRIGGERED_ORIGIN
);

// Hard cap on users per call. The composite page size is sized so that the
// entire (user × day) grid fits in a single page for a capped user set, making
// the pagination loop complete by construction (see below).
export const ELASTICSEARCH_MAX_USERS_PER_CALL = 100;
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
export interface UserDayFact {
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
 * [windowStart, windowEnd), keyed by user sId. One composite Elasticsearch
 * aggregation per call (not per user).
 *
 * Fails (rather than returning partial data) if the user set exceeds the cap or
 * if pagination does not exhaust — a partial result would silently under-count
 * activity and cause false "not activated" verdicts.
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
  if (uniqueUserIds.length > ELASTICSEARCH_MAX_USERS_PER_CALL) {
    return new Err(
      new Error(
        `activation evaluation supports at most ${ELASTICSEARCH_MAX_USERS_PER_CALL} ` +
          `users per call, got ${uniqueUserIds.length}`
      )
    );
  }
  for (const userId of uniqueUserIds) {
    factsByUser.set(userId, []);
  }

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { terms: { user_id: uniqueUserIds } },
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
      must_not: [
        // Organic constraint: drop programmatic-origin activity entirely.
        { terms: { context_origin: PROGRAMMATIC_ORIGINS } },
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
            { term: { "tools_used.server_name": FRAME_SERVER_NAME } },
            { term: { "tools_used.server_name": RUN_AGENT_SERVER_NAME } },
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
            dau: { filter: { terms: { context_origin: DAU_ORIGINS } } },
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
