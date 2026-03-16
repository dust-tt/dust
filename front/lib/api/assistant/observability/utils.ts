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

export function buildAgentAnalyticsBaseQuery({
  workspaceId,
  agentId,
  days,
  version,
  feedbackNestedQuery,
}: {
  workspaceId: string;
  agentId?: string;
  days?: number;
  version?: string;
  feedbackNestedQuery?: estypes.QueryDslQueryContainer;
}): estypes.QueryDslQueryContainer {
  const filters: estypes.QueryDslQueryContainer[] = [
    { term: { workspace_id: workspaceId } },
    ...(agentId ? [{ term: { agent_id: agentId } }] : []),
  ];

  if (days) {
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
