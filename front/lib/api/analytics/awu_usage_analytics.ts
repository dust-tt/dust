import type { CreditBreakdownBy } from "@app/lib/api/assistant/observability/credit_usage";
import {
  fetchCreditTimeseries,
  fetchCreditTimeseriesBreakdown,
  fetchCreditTimeseriesByUsageType,
} from "@app/lib/api/assistant/observability/credit_usage";
import { daysToInstantRange } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const TERMS_GROUP_BY_KEYS = [
  "agent",
  "user",
  "origin",
  "api_key",
] as const satisfies readonly CreditBreakdownBy[];

// usage_type is derived (no stored field): User vs Programmatic, split on
// user_id. The other groupings map directly to CreditBreakdownBy.
const ANALYTICS_GROUP_BY_KEYS = ["usage_type", ...TERMS_GROUP_BY_KEYS] as const;

export const ANALYTICS_SCOPE_DIMENSIONS = TERMS_GROUP_BY_KEYS;
export type AnalyticsScopeDimension =
  (typeof ANALYTICS_SCOPE_DIMENSIONS)[number];

export type AnalyticsScopeFilter = Partial<
  Record<AnalyticsScopeDimension, string[]>
>;

const FilterSchema = z.record(
  z.enum(ANALYTICS_SCOPE_DIMENSIONS),
  z.string().array()
);

export const AwuUsageAnalyticsQuerySchema = z.object({
  groupBy: z.enum(ANALYTICS_GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
  granularity: z.enum(["day", "week", "month"]).optional().default("day"),
  days: z.coerce.number().int().positive().optional().default(30),
  filter: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) {
        return undefined;
      }
      try {
        return JSON.parse(val);
      } catch {
        return val; // Return original to trigger validation error.
      }
    })
    .pipe(FilterSchema.optional()),
});

export type AwuUsageAnalyticsQuery = z.infer<
  typeof AwuUsageAnalyticsQuerySchema
>;

export type AwuUsageAnalyticsGroup = { groupKey: string; name: string };

export type AwuUsageAnalyticsPoint = {
  timestamp: number;
  values: Record<string, number>;
};

export type AwuUsageAnalyticsResponse = {
  granularity: "day" | "week" | "month";
  groups: AwuUsageAnalyticsGroup[];
  points: AwuUsageAnalyticsPoint[];
};

export type AwuUsageAnalyticsError = {
  type: "internal_error";
  message: string;
};

function toError(error: ElasticsearchError): AwuUsageAnalyticsError {
  return {
    type: "internal_error",
    message: `Failed to retrieve AWU usage: ${error.message}`,
  };
}

export async function getAwuUsageFromAnalytics(
  auth: Authenticator,
  query: AwuUsageAnalyticsQuery,
  options: { userIds?: string[] } = {}
): Promise<Result<AwuUsageAnalyticsResponse, AwuUsageAnalyticsError>> {
  const { groupBy, groupByCount, granularity, days, filter } = query;
  const { startDate, endDate } = daysToInstantRange(days, "UTC");

  const userIds = options.userIds ?? filter?.user;
  const agentIds = filter?.agent;
  const contextOrigin = filter?.origin;
  const apiKeyNames = filter?.api_key;

  if (!groupBy) {
    const result = await fetchCreditTimeseries(auth, {
      startDate,
      endDate,
      granularity,
      timezone: "UTC",
      fillWindow: true,
      userIds,
      agentIds,
      contextOrigin,
      apiKeyNames,
    });
    if (result.isErr()) {
      return new Err(toError(result.error));
    }

    const points: AwuUsageAnalyticsPoint[] = result.value.map((point) => ({
      timestamp: point.timestamp,
      values: { total: point.totalCredits },
    }));

    return new Ok({
      granularity,
      groups: [{ groupKey: "total", name: "Total usage" }],
      points,
    });
  }

  if (groupBy === "usage_type") {
    const result = await fetchCreditTimeseriesByUsageType(auth, {
      startDate,
      endDate,
      granularity,
      timezone: "UTC",
      fillWindow: true,
      userIds,
      agentIds,
      contextOrigin,
      apiKeyNames,
    });
    if (result.isErr()) {
      return new Err(toError(result.error));
    }

    const points: AwuUsageAnalyticsPoint[] = result.value.map((point) => ({
      timestamp: point.timestamp,
      values: {
        user: point.userCredits,
        programmatic: point.programmaticCredits,
      },
    }));

    return new Ok({
      granularity,
      groups: [
        { groupKey: "user", name: "User" },
        { groupKey: "programmatic", name: "Programmatic" },
      ],
      points,
    });
  }

  const result = await fetchCreditTimeseriesBreakdown(auth, {
    startDate,
    endDate,
    granularity,
    timezone: "UTC",
    breakdownBy: groupBy,
    limit: groupByCount,
    fillWindow: true,
    userIds,
    agentIds,
    contextOrigin,
    apiKeyNames,
  });
  if (result.isErr()) {
    return new Err(toError(result.error));
  }

  const { groups, points } = result.value;

  let hasOthers = false;
  const mappedPoints: AwuUsageAnalyticsPoint[] = points.map((point) => {
    const values: Record<string, number> = {};
    groups.forEach((group, index) => {
      values[group.groupKey] = point.groupCredits[index] ?? 0;
    });
    if (point.otherCredits > 0) {
      values["others"] = point.otherCredits;
      hasOthers = true;
    }
    return { timestamp: point.timestamp, values };
  });

  const mappedGroups: AwuUsageAnalyticsGroup[] = groups.map((group) => ({
    groupKey: group.groupKey,
    name: group.name,
  }));
  if (hasOthers) {
    mappedGroups.push({ groupKey: "others", name: "Others" });
  }

  return new Ok({ granularity, groups: mappedGroups, points: mappedPoints });
}

export type AwuUsageCsvRow = {
  date: string;
  granularity: "day" | "week" | "month";
  series: string;
  credits: number;
};

// Flattens the timeseries response into one CSV row per (bucket, series).
// `seriesFilter` is a comma-separated list of group keys mirroring the chart's
// legend drilldown; when absent, every returned series is included.
export function awuUsageToCsvRows(
  response: AwuUsageAnalyticsResponse,
  seriesFilter: string | undefined
): AwuUsageCsvRow[] {
  const { granularity, groups, points } = response;
  const filter = seriesFilter ? new Set(seriesFilter.split(",")) : null;
  const visibleGroups = filter
    ? groups.filter((group) => filter.has(group.groupKey))
    : groups;
  return points.flatMap((point) => {
    const date = new Date(point.timestamp).toISOString().slice(0, 10);
    return visibleGroups.map((group) => ({
      date,
      granularity,
      series: group.name,
      credits: point.values[group.groupKey] ?? 0,
    }));
  });
}
