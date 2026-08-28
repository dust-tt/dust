import {
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import {
  formatDateFromMillis,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { DAY_MS } from "@app/types/shared/utils/date_utils";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";

export interface ActiveUsersExportRow {
  date: string;
  dau: number;
  wau: number;
  mau: number;
}

interface CompositeKey {
  day: number;
  user: string;
}

interface UserDayBucket {
  key: CompositeKey;
  doc_count: number;
}

interface ActiveUsersExportAggs {
  by_user_day?: {
    after_key?: CompositeKey;
    buckets: UserDayBucket[];
  };
}

const WAU_WINDOW_DAYS = 7;
const MAU_WINDOW_DAYS = 28;
const COMPOSITE_AGG_SIZE = 10_000;

/**
 * Computes the count of unique users over a rolling window ending at the given timestamp.
 */
function computeRollingActiveUsers(
  usersByDay: Map<number, Set<string>>,
  endTimestampMs: number,
  windowDays: number
): number {
  const startMs = endTimestampMs - (windowDays - 1) * DAY_MS;
  const uniqueUsers = new Set<string>();

  for (const [ts, users] of usersByDay) {
    if (ts >= startMs && ts <= endTimestampMs) {
      for (const user of users) {
        uniqueUsers.add(user);
      }
    }
  }

  return uniqueUsers.size;
}

/**
 * Fetches DAU/WAU/MAU metrics for the export's [startDate, endDate] inclusive
 * calendar-day window from the consumption index.
 *
 * Strategy:
 * 1. Fetch all (day, user id) pairs with a paginated composite aggregation,
 *    extending the queried range back by the MAU window so the rolling
 *    windows for the first requested days are complete.
 * 2. Compute the rolling WAU (7-day) and MAU (28-day) windows in memory.
 *
 * Programmatic consumption (triggers, API runs without an attributable
 * member) carries no `user.id`, so it is naturally excluded from the
 * composite aggregation's per-day user sets.
 */
export async function fetchActiveUsersExportRows(
  auth: Authenticator,
  {
    startDate,
    endDate,
    timezone,
  }: { startDate: string; endDate: string; timezone: string }
): Promise<Result<ActiveUsersExportRow[], Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  // Resolved to timezone-local instants, not bare "YYYY-MM-DD" strings:
  // Elasticsearch parses a bare date as UTC midnight, which would disagree
  // with the composite aggregation's timezone-local day buckets below.
  const extendedStartInstant = moment
    .tz(startDate, timezone)
    .subtract(MAU_WINDOW_DAYS - 1, "days")
    .startOf("day")
    .toISOString();
  const exclusiveEndInstant = moment
    .tz(endDate, timezone)
    .add(1, "day")
    .startOf("day")
    .toISOString();
  const cutoffTimestampMs = moment
    .tz(startDate, timezone)
    .startOf("day")
    .valueOf();

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        {
          range: {
            [COMPLETED_AT_FIELD]: {
              gte: extendedStartInstant,
              lt: exclusiveEndInstant,
            },
          },
        },
      ],
    },
  };

  const usersByDay = new Map<number, Set<string>>();
  let afterKey: CompositeKey | undefined;
  let buckets: UserDayBucket[];

  do {
    const result = await searchConsumptionAnalytics<
      never,
      ActiveUsersExportAggs
    >(query, {
      aggregations: {
        by_user_day: {
          composite: {
            size: COMPOSITE_AGG_SIZE,
            sources: [
              {
                day: {
                  date_histogram: {
                    field: COMPLETED_AT_FIELD,
                    calendar_interval: "day",
                    time_zone: timezone,
                  },
                },
              },
              { user: { terms: { field: CONSUMPTION_DIMENSION_FIELDS.user } } },
            ],
            ...(afterKey ? { after: afterKey } : {}),
          },
        },
      },
      size: 0,
    });

    if (result.isErr()) {
      return result;
    }

    const aggregation = result.value.aggregations?.by_user_day;
    buckets = aggregation?.buckets ?? [];
    for (const bucket of buckets) {
      const users = usersByDay.get(bucket.key.day);
      if (users) {
        users.add(bucket.key.user);
      } else {
        usersByDay.set(bucket.key.day, new Set([bucket.key.user]));
      }
    }

    afterKey = aggregation?.after_key;
  } while (afterKey !== undefined && buckets.length > 0);

  const requestedTimestampsMs = [...usersByDay.keys()]
    .filter((ts) => ts >= cutoffTimestampMs)
    .sort((a, b) => a - b);

  const rows: ActiveUsersExportRow[] = requestedTimestampsMs.map(
    (timestampMs) => ({
      date: formatDateFromMillis(timestampMs, timezone),
      dau: usersByDay.get(timestampMs)?.size ?? 0,
      wau: computeRollingActiveUsers(usersByDay, timestampMs, WAU_WINDOW_DAYS),
      mau: computeRollingActiveUsers(usersByDay, timestampMs, MAU_WINDOW_DAYS),
    })
  );

  return new Ok(rows);
}
