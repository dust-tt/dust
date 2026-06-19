import type { CreditBreakdownBy } from "@app/lib/api/assistant/observability/credit_usage";
import {
  fetchCreditTimeseries,
  fetchCreditTimeseriesBreakdown,
} from "@app/lib/api/assistant/observability/credit_usage";
import { daysToInstantRange } from "@app/lib/api/assistant/observability/utils";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

const ANALYTICS_GROUP_BY_KEYS = [
  "agent",
  "user",
  "origin",
] as const satisfies readonly CreditBreakdownBy[];

export const AwuUsageAnalyticsQuerySchema = z.object({
  groupBy: z.enum(ANALYTICS_GROUP_BY_KEYS).optional(),
  groupByCount: z.coerce.number().optional().default(5),
  granularity: z.enum(["day", "week", "month"]).optional().default("day"),
  days: z.coerce.number().int().positive().optional().default(30),
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
  query: AwuUsageAnalyticsQuery
): Promise<Result<AwuUsageAnalyticsResponse, AwuUsageAnalyticsError>> {
  const { groupBy, groupByCount, granularity, days } = query;
  const { startDate, endDate } = daysToInstantRange(days, "UTC");

  if (!groupBy) {
    const result = await fetchCreditTimeseries(auth, {
      startDate,
      endDate,
      granularity,
      timezone: "UTC",
      fillWindow: true,
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

  const result = await fetchCreditTimeseriesBreakdown(auth, {
    startDate,
    endDate,
    granularity,
    timezone: "UTC",
    breakdownBy: groupBy,
    limit: groupByCount,
    fillWindow: true,
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
