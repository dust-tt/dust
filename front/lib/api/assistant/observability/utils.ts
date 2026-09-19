import {
  AGENT_TAG_IDS_FIELD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
} from "@app/lib/api/analytics/consumption/scope";
import { contextOriginFilter } from "@app/lib/api/assistant/observability/context_origin";
import type { Authenticator } from "@app/lib/auth";
import { FREE_ORIGINS } from "@app/lib/metronome/events";
import type { estypes } from "@elastic/elasticsearch";
import { format, startOfDay, subDays } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export function daysToDateRange(
  days: number,
  timezone: string = "UTC"
): { startDate: string; endDate: string } {
  const zonedNow = toZonedTime(new Date(), timezone);
  const end = format(zonedNow, "yyyy-MM-dd");
  const start = format(subDays(zonedNow, days - 1), "yyyy-MM-dd");
  return { startDate: start, endDate: end };
}

// Tz-aware [start-of-day (days-1 ago), now] window as ISO instants. Mirrors the
// window the workspace_analytics tools resolve for a relative "last N days"
// period, so the dashboard and the analyst agent query the exact same range.
export function daysToInstantRange(
  days: number,
  timezone: string = "UTC"
): { startDate: string; endDate: string } {
  const now = new Date();
  const zonedStart = startOfDay(subDays(toZonedTime(now, timezone), days - 1));
  return {
    startDate: fromZonedTime(zonedStart, timezone).toISOString(),
    endDate: now.toISOString(),
  };
}

// Sentinel group key for messages sent without an API key (no `api_key_name`
// on the document). Used both as the terms-agg `missing` bucket key and as a
// filterable id, so grouping by API key still sums to the total consumption.
export const NOT_API_GROUP_KEY = "__not_api__";
export const NOT_API_GROUP_NAME = "Not API";

// Model that actually ran the message, resolved at message creation.
export const MODEL_ID_FIELD = "model.model_id";

// Agent that executed the message on the consumption index, the counterpart of
// the legacy index's `agent_id`. Deliberately not
// `CONSUMPTION_DIMENSION_FIELDS.agent` (`agent.attributed_id`), which rolls
// hidden helper agents up to their user-facing parent: that is a grouping
// change, not a field rename.
const CONSUMPTION_AGENT_ID_FIELD = "agent.id";

// api_key_name is only set on API-key authenticated messages. The sentinel
// selects everything else (missing field), so a mixed selection becomes a
// disjunction of the two.
function apiKeyNamesFilter(
  apiKeyNames: string[] | undefined
): estypes.QueryDslQueryContainer[] {
  if (!apiKeyNames || apiKeyNames.length === 0) {
    return [];
  }
  const names = apiKeyNames.filter((name) => name !== NOT_API_GROUP_KEY);
  const clauses: estypes.QueryDslQueryContainer[] = [
    ...termFilter("api_key_name", names),
    ...(apiKeyNames.includes(NOT_API_GROUP_KEY)
      ? [
          {
            bool: { must_not: [{ exists: { field: "api_key_name" } }] },
          },
        ]
      : []),
  ];
  if (clauses.length <= 1) {
    return clauses;
  }
  return [{ bool: { should: clauses, minimum_should_match: 1 } }];
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
  agentTagIds,
  userIds,
  apiKeyNames,
  contextOrigin,
  modelIds,
  days,
  startDate,
  endDate,
  version,
  feedbackNestedQuery,
}: {
  workspaceId: string;
  agentTagIds?: string[];
  userIds?: string[];
  apiKeyNames?: string[];
  contextOrigin?: string | string[];
  modelIds?: string[];
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
    ...termFilter("agent_tag_ids", agentTagIds),
    ...termFilter("user_id", userIds),
    ...apiKeyNamesFilter(apiKeyNames),
    ...contextOriginFilter(contextOrigin),
    ...termFilter(MODEL_ID_FIELD, modelIds),
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

// Workspace-scoped credit query over the consumption index: the window, the
// dashboard filters and the free-origin exclusion the credit fetchers share.
// Built on the consumption fields rather than parameterizing
// `buildAgentAnalyticsBaseQuery` by field name, because that builder is still
// shared with the legacy-index readers (`messages_export`,
// `datasource_retrieval`).
//
// No status filter: `credit_micro` already encodes the billed amount per
// consumption unit, so a failed message contributes only the work that was
// actually charged. The free-origin exclusion is redundant with the pipeline,
// which never indexes `USAGE_TYPE_FREE` usage, but keeps the scope explicit and
// identical to the legacy query it replaces.
/**
 * @cc [owner:sfriquet,label:product] credits-scope-excludes-free-origins
 * The returned query MUST exclude documents whose `context_origin` is one of
 * `FREE_ORIGINS`, and MUST NOT constrain document `status`. `credit_micro`
 * already carries the billed amount of each consumption unit, so a status
 * filter would drop work that was actually charged on messages that later
 * failed.
 */
export function buildConsumptionCreditsScopeQuery(
  auth: Authenticator,
  {
    startDate,
    endDate,
    contextOrigin,
    agentIds,
    userIds,
    apiKeyNames,
    agentTagIds,
    modelIds,
    extraFilters = [],
    extraMustNot = [],
  }: {
    startDate: string;
    endDate: string;
    contextOrigin?: string | string[];
    agentIds?: string[];
    userIds?: string[];
    apiKeyNames?: string[];
    agentTagIds?: string[];
    modelIds?: string[];
    extraFilters?: estypes.QueryDslQueryContainer[];
    extraMustNot?: estypes.QueryDslQueryContainer[];
  }
): estypes.QueryDslQueryContainer {
  return {
    bool: {
      filter: [
        { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
        ...termFilter(CONSUMPTION_AGENT_ID_FIELD, agentIds),
        ...termFilter(AGENT_TAG_IDS_FIELD, agentTagIds),
        ...termFilter(CONSUMPTION_DIMENSION_FIELDS.user, userIds),
        ...apiKeyNamesFilter(apiKeyNames),
        ...contextOriginFilter(contextOrigin),
        ...termFilter(MODEL_ID_FIELD, modelIds),
        { range: { [COMPLETED_AT_FIELD]: { gte: startDate, lte: endDate } } },
        ...extraFilters,
      ],
      must_not: [
        { terms: { context_origin: [...FREE_ORIGINS] } },
        ...extraMustNot,
      ],
    },
  };
}

// Field the consumption index carries for each grouping dimension the credit
// dashboards offer. `agent` and `origin` intentionally mirror the legacy
// fields (`agent.id`, `context_origin`) rather than the consumption module's
// analytics conventions (`agent.attributed_id`, `normalized_origin`), so the
// index swap does not silently change how rows are grouped.
/**
 * @cc [owner:sfriquet,label:product] credit-grouping-mirrors-legacy-dimensions
 * The `agent` dimension MUST group on the executing agent (`agent.id`) and the
 * `origin` dimension on the raw `context_origin`. Repointing them at the
 * consumption module's `agent.attributed_id` or `normalized_origin` changes
 * which rows the dashboards merge together, and is a product change rather
 * than an alignment refactor.
 */
export const CONSUMPTION_CREDIT_GROUP_FIELDS = {
  agent: CONSUMPTION_AGENT_ID_FIELD,
  user: CONSUMPTION_DIMENSION_FIELDS.user,
  origin: "context_origin",
  api_key: "api_key_name",
  model: MODEL_ID_FIELD,
} as const;
