import { isValidTimezone, timezoneSchema } from "@app/lib/api/timezone";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import moment from "moment-timezone";
import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Caps the span an explicit start/end range may scan so a single query can't
// sweep an unbounded history. Relative periods are bounded by construction and
// are never rejected.
export const MAX_QUERY_WINDOW_DAYS = 100;

export const DEFAULT_RESULTS = 25;
export const MAX_RESULTS = 100;

export const ANALYTICS_PERIODS = [
  "this_month",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_quarter",
] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

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

export const timeWindowInputSchema = z.object(timeWindowSchemaShape);

// Shared filter fragment for message-based usage tools.
export const usageFilterSchema = {
  source: z
    .string()
    .optional()
    .describe(
      "Filter to a single message origin (context_origin), e.g. web, slack, " +
        "api, extension, cli, or 'unknown' for messages with no recorded origin."
    ),
  agentIds: z
    .array(z.string())
    .optional()
    .describe("Restrict to messages from these agent sIds."),
  userIds: z
    .array(z.string())
    .optional()
    .describe("Restrict to messages from these user sIds."),
};

export type TimeWindowInput = z.input<typeof timeWindowInputSchema>;

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
