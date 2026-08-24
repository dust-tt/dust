import {
  formatDateFromMillis,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
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

export type GetWorkspaceActiveUsersResponse = {
  points: ActiveUsersMetricsPoint[];
};

interface UserDayBucket {
  key: {
    day: number;
    user: string;
  };
  doc_count: number;
}

interface CompositeKey {
  day: number;
  user: string;
}

interface ActiveUsersAggs {
  by_user_day?: {
    after_key?: CompositeKey;
    buckets: UserDayBucket[];
  };
}

const WAU_WINDOW_DAYS = 7;
const MAU_WINDOW_DAYS = 28;
const COMPOSITE_AGG_SIZE = 10000;
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
 * 1. Fetch all (day, user ID) pairs with a paginated composite aggregation
 * 2. Compute rolling WAU (7-day) and MAU (30-day) windows on the server
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

  const usersByDay = new Map<number, Set<string>>();
  let afterKey: CompositeKey | undefined;
  let buckets: UserDayBucket[];

  do {
    const result = await searchAnalytics<never, ActiveUsersAggs>(query, {
      aggregations: {
        by_user_day: {
          composite: {
            size: COMPOSITE_AGG_SIZE,
            sources: [
              {
                day: {
                  date_histogram: {
                    field: "timestamp",
                    calendar_interval: "day",
                    time_zone: timezone,
                  },
                },
              },
              { user: { terms: { field: "user_id" } } },
            ],
            ...(afterKey ? { after: afterKey } : {}),
          },
        },
      },
      size: 0,
    });

    if (result.isErr()) {
      const status =
        result.error.statusCode !== undefined
          ? `, HTTP ${result.error.statusCode}`
          : "";

      return new Err(
        new Error(
          `Elasticsearch query failed (${result.error.type}${status}): ${result.error.message}`,
          { cause: result.error }
        )
      );
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

  const sortedTimestamps = [...usersByDay.keys()].sort((a, b) => a - b);

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
      date: formatDateFromMillis(timestamp, timezone),
      dau,
      wau,
      mau,
      memberCount: memberCountsByDay.get(timestamp) ?? 0,
    });
  }

  return new Ok(points);
}

interface ConsumptionCompositeKey {
  day: number;
  user: string;
}

interface ConsumptionUserDayBucket {
  key: ConsumptionCompositeKey;
  doc_count: number;
}

interface ConsumptionActiveUsersAggs {
  by_user_day?: {
    after_key?: ConsumptionCompositeKey;
    buckets: ConsumptionUserDayBucket[];
  };
}

// Consumption-index counterpart of `fetchActiveUsersMetrics`, scoped to the
// `active_users` export table. Programmatic runs simply have no `user.id` on
// the consumption index (rather than the old index's "unknown" sentinel), and
// a terms aggregation already skips documents missing the aggregated field,
// so no equivalent must_not filter is needed here.
export async function fetchConsumptionActiveUsersMetrics(
  auth: Authenticator,
  startDate: string,
  endDate: string,
  timezone: string = "UTC"
): Promise<Result<ActiveUsersMetricsPoint[], Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const workspaceId = workspace.sId;

  const extendedStart = moment
    .tz(startDate, timezone)
    .subtract(MAU_WINDOW_DAYS - 1, "days")
    .format("YYYY-MM-DD");
  const rangeFilter: estypes.QueryDslQueryContainer = {
    range: { completed_at: { gte: extendedStart, lte: endDate } },
  };
  const cutoffTimestamp = moment
    .tz(startDate, timezone)
    .startOf("day")
    .valueOf();

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [{ term: { workspace_id: workspaceId } }, rangeFilter],
    },
  };

  const usersByDay = new Map<number, Set<string>>();
  let afterKey: ConsumptionCompositeKey | undefined;
  let buckets: ConsumptionUserDayBucket[];

  do {
    const result = await searchConsumptionAnalytics<
      never,
      ConsumptionActiveUsersAggs
    >(query, {
      aggregations: {
        by_user_day: {
          composite: {
            size: COMPOSITE_AGG_SIZE,
            sources: [
              {
                day: {
                  date_histogram: {
                    field: "completed_at",
                    calendar_interval: "day",
                    time_zone: timezone,
                  },
                },
              },
              { user: { terms: { field: "user.id" } } },
            ],
            ...(afterKey ? { after: afterKey } : {}),
          },
        },
      },
      size: 0,
    });

    if (result.isErr()) {
      const status =
        result.error.statusCode !== undefined
          ? `, HTTP ${result.error.statusCode}`
          : "";

      return new Err(
        new Error(
          `Elasticsearch query failed (${result.error.type}${status}): ${result.error.message}`,
          { cause: result.error }
        )
      );
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

  const sortedTimestamps = [...usersByDay.keys()].sort((a, b) => a - b);

  const requestedTimestamps = sortedTimestamps.filter(
    (ts) => ts >= cutoffTimestamp
  );

  const memberCountsByDay = await MembershipResource.countActiveMembersPerDay({
    workspace,
    timestampsMs: requestedTimestamps,
  });

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
      date: formatDateFromMillis(timestamp, timezone),
      dau,
      wau,
      mau,
      memberCount: memberCountsByDay.get(timestamp) ?? 0,
    });
  }

  return new Ok(points);
}
