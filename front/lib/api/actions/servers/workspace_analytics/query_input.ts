import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { AGENT_TAG_IDS_FIELD } from "@app/lib/api/analytics/consumption/scope";
import { isValidTimezone, timezoneSchema } from "@app/lib/api/timezone";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";
import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Caps the span an explicit start/end range may scan so a single query can't
// sweep an unbounded history. Relative periods are bounded by construction and
// are never rejected.
export const MAX_QUERY_WINDOW_DAYS = 100;

export const DEFAULT_RESULTS = 25;
export const MAX_RESULTS = 1000;

// Credit timeseries breakdowns keep a small number of series and fold the
// remainder into an "other" group, so a stacked chart stays readable.
export const DEFAULT_CREDIT_GROUPS = 5;
export const MAX_CREDIT_GROUPS = 10;

const ANALYTICS_PERIODS = [
  "this_month",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_quarter",
] as const;
type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

// Shared time-window input fragment. Either a relative `period` or an explicit
// startDate/endDate range; explicit dates win.
export const timeWindowSchemaShape = {
  period: z
    .enum(ANALYTICS_PERIODS)
    .optional()
    .describe(
      "Relative time window. Ignored when startDate/endDate are provided. " +
        "Defaults to the tool's natural window if omitted."
    ),
  startDate: z
    .string()
    .regex(DATE_RE)
    .optional()
    .describe(
      "Start date (YYYY-MM-DD). Provide together with endDate for a custom range."
    ),
  endDate: z
    .string()
    .regex(DATE_RE)
    .optional()
    .describe(
      "End date (YYYY-MM-DD), inclusive. Provide together with startDate."
    ),
  timezone: timezoneSchema.describe(
    "IANA timezone used to resolve the window. Defaults to UTC."
  ),
};

const timeWindowInputSchema = z.object(timeWindowSchemaShape);

// Shared filter fragment for message-based usage tools.
export const usageFilterSchema = {
  source: z
    .string()
    .optional()
    .describe(
      "Filter to a single message origin (context_origin) — the source a " +
        "message came from. Many origins exist (channels, integrations, " +
        "triggers, and more); do not assume a fixed short list. Use 'unknown' " +
        "to match messages with no recorded origin."
    ),
  agentIds: z
    .array(z.string())
    .optional()
    .describe("Restrict to messages from these agent sIds."),
  userIds: z
    .array(z.string())
    .optional()
    .describe("Restrict to messages from these user sIds."),
  agentTagIds: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to messages from agents carrying any of these agent tag " +
        "sIds, as returned by get_top_agent_tags."
    ),
  modelIds: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to messages answered by these models, identified by their " +
        "model id (e.g. 'claude-sonnet-4-5'), as returned by get_top_models."
    ),
};

// Filters for the consumption-index tools. Every key narrows the same scope the
// workspace Analytics page filters on, so any value a ranking returns can be fed
// straight back in. The legacy `usageFilterSchema` above stays until the tools
// still reading the old index are gone.
export const consumptionFilterSchema = {
  sources: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to these message origins — where a message came in from. Many " +
        "origins exist (channels, integrations, triggers, and more); do not " +
        "assume a fixed short list, take the values from a 'source' ranking."
    ),
  agentIds: z
    .array(z.string())
    .optional()
    .describe("Restrict to these agent sIds."),
  userIds: z
    .array(z.string())
    .optional()
    .describe("Restrict to these user sIds."),
  agentTagIds: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to agents carrying any of these agent tag sIds, as returned " +
        "by a 'tag' ranking."
    ),
  modelIds: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to these models, identified by their model id (e.g. " +
        "'claude-sonnet-4-5'), as returned by a 'model' ranking."
    ),
  apiKeyNames: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to these API key names, as returned by an 'api_key' ranking."
    ),
  groupIds: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to members of these group sIds, as returned by a 'group' ranking."
    ),
  toolNames: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to these MCP server names, as returned by a 'tool' ranking."
    ),
  skillIds: z
    .array(z.string())
    .optional()
    .describe(
      "Restrict to these skill sIds, as returned by a 'skill' ranking."
    ),
};

const consumptionFilterInputSchema = z.object(consumptionFilterSchema);

export type ConsumptionFilterInput = z.input<
  typeof consumptionFilterInputSchema
>;

export type ConsumptionScope = {
  filter: ConsumptionScopeFilter;
  extraFilters: estypes.QueryDslQueryContainer[];
};

// Agent tags are the one input with no filter key: a document carries its
// agent's tags but no dimension is defined over them, so they go through as a
// raw clause.
export function toConsumptionScope(
  input: ConsumptionFilterInput
): ConsumptionScope {
  const agentTagIds = input.agentTagIds?.filter((id) => id.length > 0) ?? [];

  return {
    filter: {
      sources: input.sources,
      agents: input.agentIds,
      users: input.userIds,
      models: input.modelIds,
      api_keys: input.apiKeyNames,
      groups: input.groupIds,
      tools: input.toolNames,
      skills: input.skillIds,
    },
    extraFilters:
      agentTagIds.length > 0
        ? [{ terms: { [AGENT_TAG_IDS_FIELD]: agentTagIds } }]
        : [],
  };
}

// `resolveTimeWindow` reports an inclusive end instant, because the legacy index
// is queried with `lte`. The consumption index uses a half-open range, so its
// bound is the following millisecond. Goes away with the last legacy tool.
export function toConsumptionPeriod(
  window: ResolvedTimeWindow
): ConsumptionPeriod {
  return {
    startDate: window.startDate,
    endDate: new Date(new Date(window.endDate).getTime() + 1).toISOString(),
  };
}

type TimeWindowInput = z.input<typeof timeWindowInputSchema>;

export type ResolvedTimeWindow = {
  startDate: string;
  endDate: string;
  label: string;
  timezone: string;
};

// Resolves a TimeWindowInput into concrete ISO start/end instants plus a human
// label. Explicit startDate/endDate take precedence over `period`; when nothing
// is provided, falls back to `defaultPeriod`.
export function resolveTimeWindow(
  input: TimeWindowInput,
  defaultPeriod: AnalyticsPeriod = "this_month"
): Result<ResolvedTimeWindow, string> {
  const timezone = input.timezone ?? "UTC";
  if (!isValidTimezone(timezone)) {
    return new Err(`Invalid timezone: ${timezone}`);
  }

  if (input.startDate || input.endDate) {
    if (!input.startDate || !input.endDate) {
      return new Err(
        "Provide both startDate and endDate for a custom range, or neither."
      );
    }
    const start = moment.tz(input.startDate, "YYYY-MM-DD", true, timezone);
    const end = moment.tz(input.endDate, "YYYY-MM-DD", true, timezone);
    if (!start.isValid() || !end.isValid()) {
      return new Err("startDate and endDate must be valid YYYY-MM-DD dates.");
    }
    if (end.isBefore(start)) {
      return new Err("endDate must be on or after startDate.");
    }
    const inclusiveDays = end.diff(start, "days") + 1;
    if (inclusiveDays > MAX_QUERY_WINDOW_DAYS) {
      return new Err(
        `The query window cannot exceed ${MAX_QUERY_WINDOW_DAYS} days. ` +
          "Narrow the date range, or use a relative period."
      );
    }
    return new Ok({
      startDate: start.startOf("day").toISOString(),
      endDate: end.endOf("day").toISOString(),
      label: `${input.startDate} to ${input.endDate}`,
      timezone,
    });
  }

  const period = input.period ?? defaultPeriod;
  const now = moment.tz(timezone);
  let start: moment.Moment;
  let label: string;
  switch (period) {
    case "this_month":
      start = now.clone().startOf("month");
      label = now.format("MMMM YYYY");
      break;
    case "last_7_days":
      start = now.clone().subtract(6, "days").startOf("day");
      label = "the last 7 days";
      break;
    case "last_30_days":
      start = now.clone().subtract(29, "days").startOf("day");
      label = "the last 30 days";
      break;
    case "last_90_days":
      start = now.clone().subtract(89, "days").startOf("day");
      label = "the last 90 days";
      break;
    case "this_quarter":
      start = now.clone().startOf("quarter");
      label = `Q${now.quarter()} ${now.year()}`;
      break;
    default:
      return assertNever(period);
  }

  return new Ok({
    startDate: start.toISOString(),
    endDate: now.toISOString(),
    label,
    timezone,
  });
}
