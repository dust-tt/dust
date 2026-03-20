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

export function buildAgentAnalyticsBaseQuery({
  workspaceId,
  agentId,
  days,
  startDate,
  endDate,
  version,
  feedbackNestedQuery,
}: {
  workspaceId: string;
  agentId?: string;
  days?: number;
  startDate?: string;
  endDate?: string;
  version?: string;
  feedbackNestedQuery?: estypes.QueryDslQueryContainer;
}): estypes.QueryDslQueryContainer {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    ...(agentId ? [{ term: { agent_id: agentId } }] : []),
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
