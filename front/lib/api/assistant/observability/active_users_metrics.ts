import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";

export interface ActiveUsersMetricsPoint {
  timestamp: number;
  date: string;
  dau: number;
  wau: number;
  mau: number;
  memberCount: number;
}

interface UserBucket {
  key: string;
  doc_count: number;
}

interface DayBucket {
  key: number;
  key_as_string: string;
  doc_count: number;
  users?: estypes.AggregationsMultiBucketAggregateBase<UserBucket>;
}

interface ActiveUsersAggs {
  by_day?: estypes.AggregationsMultiBucketAggregateBase<DayBucket>;
}

const WAU_WINDOW_DAYS = 7;
const MAU_WINDOW_DAYS = 28;
const MAX_USERS_PER_DAY = 10000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Computes the count of unique users over a rolling window ending at the given timestamp.
 */
function computeRollingActiveUsers(
  usersByDay: Map<number, Set<string>>,
  endTimestamp: number,
  windowDays: number
): number {
  const startMs = endTimestamp - (windowDays - 1) * MS_PER_DAY;
  const uniqueUsers = new Set<string>();

  for (const [ts, users] of usersByDay) {
    if (ts >= startMs && ts <= endTimestamp) {
      for (const user of users) {
        uniqueUsers.add(user);
      }
    }
  }

  return uniqueUsers.size;
}

/**
 * Fetches DAU/WAU/MAU metrics for the given time range.
 *
 * Strategy:
 * 1. Fetch user IDs per day using a single ES query with terms aggregation
 * 2. Compute rolling WAU (7-day) and MAU (30-day) windows on the server
 *
 * This approach is efficient (single ES query) and accurate for typical workspace sizes.
 */
export async function fetchActiveUsersMetrics(
  workspace: LightWorkspaceType,
  startDate: string,
  endDate: string,
  timezone: string = "UTC"
): Promise<Result<ActiveUsersMetricsPoint[], Error>> {
  const workspaceId = workspace.sId;

  const extendedStart = moment
    .tz(startDate, timezone)
    .subtract(MAU_WINDOW_DAYS - 1, "days")
    .format("YYYY-MM-DD");
  const rangeFilter: estypes.QueryDslQueryContainer = {
    range: { timestamp: { gte: extendedStart, lte: endDate } },
  };
  const cutoffTimestamp = moment
    .tz(startDate, timezone)
    .startOf("day")
    .valueOf();

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        rangeFilter,
        { bool: { must_not: { term: { user_id: "unknown" } } } }, // Exclude programmatic usage
      ],
    },
  };

  const result = await searchAnalytics<never, ActiveUsersAggs>(query, {
    aggregations: {
      by_day: {
        date_histogram: {
          field: "timestamp",
          calendar_interval: "day",
          time_zone: timezone,
        },
        aggs: {
          users: {
            terms: {
              field: "user_id",
              size: MAX_USERS_PER_DAY,
            },
          },
        },
      },
    },
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const dayBuckets = bucketsToArray<DayBucket>(
    result.value.aggregations?.by_day?.buckets
  );

  // Build a map of timestamp -> Set of user IDs
  const usersByDay = new Map<number, Set<string>>();
  const sortedTimestamps: number[] = [];

  for (const bucket of dayBuckets) {
    const users = bucketsToArray<UserBucket>(bucket.users?.buckets);
    const userSet = new Set(users.map((u) => u.key));
    usersByDay.set(bucket.key, userSet);
    sortedTimestamps.push(bucket.key);
  }

  sortedTimestamps.sort((a, b) => a - b);

  // Collect timestamps in the requested range for membership counting.
  const requestedTimestamps = sortedTimestamps.filter(
    (ts) => ts >= cutoffTimestamp
  );

  // Fetch historical member counts per day.
  const memberCountsByDay = await MembershipResource.countActiveMembersPerDay({
    workspace,
    timestampsMs: requestedTimestamps,
  });

  // Calculate rolling windows for each day in the requested range
  const points: ActiveUsersMetricsPoint[] = [];

  for (const timestamp of requestedTimestamps) {
    const dau = usersByDay.get(timestamp)?.size ?? 0;
    const wau = computeRollingActiveUsers(
      usersByDay,
      timestamp,
      WAU_WINDOW_DAYS
    );
    const mau = computeRollingActiveUsers(
      usersByDay,
      timestamp,
      MAU_WINDOW_DAYS
    );

    points.push({
      timestamp,
      date: formatUTCDateFromMillis(timestamp),
      dau,
      wau,
      mau,
      memberCount: memberCountsByDay.get(timestamp) ?? 0,
    });
  }

  return new Ok(points);
}
