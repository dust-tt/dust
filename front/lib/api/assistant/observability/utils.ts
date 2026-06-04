import { contextOriginFilter } from "@app/lib/api/assistant/observability/context_origin";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";
import { z } from "zod";

const VALID_TIMEZONES = new Set(moment.tz.names());

export const timezoneSchema = z
  .string()
  .optional()
  .default("UTC")
  .refine((tz) => VALID_TIMEZONES.has(tz), {
    message: "Invalid IANA timezone",
  });

export function daysToDateRange(
  days: number,
  timezone: string = "UTC"
): { startDate: string; endDate: string } {
  const end = moment.tz(timezone).format("YYYY-MM-DD");
  const start = moment
    .tz(timezone)
    .subtract(days - 1, "days")
    .format("YYYY-MM-DD");
  return { startDate: start, endDate: end };
}

function termFilter(
  field: string,
  value: string | string[] | undefined
): estypes.QueryDslQueryContainer[] {
  if (value === undefined) {
    return [];
  }
  const values = (Array.isArray(value) ? value : [value]).filter(
    (v) => v.length > 0
  );
  if (values.length === 0) {
    return [];
  }
  return [
    values.length === 1
      ? { term: { [field]: values[0] } }
      : { terms: { [field]: values } },
  ];
}

export function buildAgentAnalyticsBaseQuery({
  workspaceId,
  agentId,
  agentIds,
  userIds,
  contextOrigin,
  days,
  startDate,
  endDate,
  version,
  feedbackNestedQuery,
}: {
  workspaceId: string;
  userIds?: string[];
  contextOrigin?: string | string[];
  days?: number;
  startDate?: string;
  endDate?: string;
  version?: string;
  feedbackNestedQuery?: estypes.QueryDslQueryContainer;
} & (
  | { agentId?: string; agentIds?: never }
  | { agentId?: never; agentIds?: string[] }
)): estypes.QueryDslQueryContainer {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    ...(agentId ? [{ term: { agent_id: agentId } }] : []),
    ...termFilter("agent_id", agentIds),
    ...termFilter("user_id", userIds),
    ...contextOriginFilter(contextOrigin),
  ];

  if (startDate && endDate) {
    filters.push({
      range: { timestamp: { gte: startDate, lte: endDate } },
    });
  } else if (days) {
    filters.push({ range: { timestamp: { gte: `now-${days}d/d` } } });
  }
  if (version) {
    filters.push({ term: { agent_version: version } });
  }
  if (feedbackNestedQuery) {
    filters.push({ nested: { path: "feedbacks", query: feedbackNestedQuery } });
  }

  return {
    bool: {
      filter: filters,
    },
  };
}
