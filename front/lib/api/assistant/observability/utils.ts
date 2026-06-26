import { contextOriginFilter } from "@app/lib/api/assistant/observability/context_origin";
import type { Authenticator } from "@app/lib/auth";
import { FREE_ORIGINS } from "@app/lib/metronome/events";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";

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

// Tz-aware [start-of-day (days-1 ago), now] window as ISO instants. Mirrors the
// window the workspace_analytics tools resolve for a relative "last N days"
// period, so the dashboard and the analyst agent query the exact same range.
export function daysToInstantRange(
  days: number,
  timezone: string = "UTC"
): { startDate: string; endDate: string } {
  const now = moment.tz(timezone);
  return {
    startDate: now
      .clone()
      .subtract(days - 1, "days")
      .startOf("day")
      .toISOString(),
    endDate: now.toISOString(),
  };
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

// Workspace query scoped to the window, with free origins excluded and only the
// billed message statuses kept, to mirror the non-free billed scope. Metronome
// only emits usage events and credits for AGENT_MESSAGE_STATUSES_TO_TRACK (see
// usage_queue activities and credit_cost), so failed messages carry a non-zero
// `cost.full_awu` in the index but are never billed; without the status filter
// the credit totals over-count failed runs and diverge from Metronome. Shared by
// the credit fetchers (timeseries, breakdown, per-user and per-agent tables) so
// the scope stays identical across them. `extraFilters` / `extraMustNot` carry
// per-caller constraints (e.g. requiring an agent_id, or excluding the
// programmatic "unknown" user).
export function buildCreditsScopeQuery(
  auth: Authenticator,
  {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
    extraFilters = [],
    extraMustNot = [],
  }: {
    startDate: string;
    endDate: string;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    extraFilters?: estypes.QueryDslQueryContainer[];
    extraMustNot?: estypes.QueryDslQueryContainer[];
  }
): estypes.QueryDslQueryContainer {
  const baseQuery = buildAgentAnalyticsBaseQuery({
    workspaceId: auth.getNonNullableWorkspace().sId,
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
  });
  return {
    bool: {
      filter: [
        baseQuery,
        { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
        ...extraFilters,
      ],
      must_not: [
        { terms: { context_origin: [...FREE_ORIGINS] } },
        ...extraMustNot,
      ],
    },
  };
}
