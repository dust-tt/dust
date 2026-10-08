import type { ToolContext } from "@app/lib/actions/types";
import {
  isAgentLoopRunContext,
  isSandboxFunctionRunContext,
} from "@app/lib/actions/types";
import logger from "@app/logger/logger";
import { isUserMessageType } from "@app/types/assistant/conversation";
import { TZDate } from "@date-fns/tz";
import { z } from "zod";

// Intl throws on a timezone it doesn't recognize, and @date-fns/tz relies on Intl
// for zone resolution, so a value that passes here is safe to hand to it.
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const MINUTES_IN_A_DAY = 1440;

// Intl's "longOffset" is instant-aware, so an instant in the hour surrounding a DST transition
// resolves to the offset actually in effect.
function getUtcOffsetMinutes(timezone: string, instant: Date): number {
  if (!isValidTimezone(timezone)) {
    logger.warn(
      { timezone },
      "Invalid IANA timezone, resolving time-of-day as UTC"
    );
    return 0;
  }
  const offsetName = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = offsetName && /^GMT([+-])(\d{2}):(\d{2})$/.exec(offsetName);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * @cc [owner:avervaet,label:backend] fixed-utc-offset-not-dst-tracking
 * The returned UTC hour/minute is resolved once, against `reference`'s UTC offset for
 * `timezone`. A caller that bakes the result into a long-lived fixed schedule (e.g. a daily
 * cron expression) does NOT get its fire time re-resolved across DST transitions: the local
 * fire time will drift by the DST delta (typically 1h) until the schedule is recomputed.
 */
/**
 * @cc [owner:avervaet,label:backend;error-handling] unknown-timezone-resolves-as-utc
 * An unrecognized `timezone` never throws: the wall time is returned unchanged (offset 0) and a
 * warning is logged, matching the moment.js fallback this replaces. Callers that need a hard
 * failure must validate upstream with `isValidTimezone`.
 */
export function localTimeOfDayToUtc(
  hour: number,
  minute: number,
  timezone: string,
  reference: Date = new Date()
): { hour: number; minute: number } {
  const offsetMinutes = getUtcOffsetMinutes(timezone, reference);
  const relativeMinutesOfDay = hour * 60 + minute - offsetMinutes;
  const minutesOfDay =
    ((relativeMinutesOfDay % MINUTES_IN_A_DAY) + MINUTES_IN_A_DAY) %
    MINUTES_IN_A_DAY;
  return { hour: Math.floor(minutesOfDay / 60), minute: minutesOfDay % 60 };
}

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarDate(
  isoDate: string
): { year: number; month: number; day: number } | null {
  if (!CALENDAR_DATE_RE.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const exists =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return exists ? { year, month, day } : null;
}

export function dayBoundaryInTimezone(
  isoDate: string,
  timezone: string,
  {
    offsetDays = 0,
    boundary = "start",
  }: { offsetDays?: number; boundary?: "start" | "end" } = {}
): Date {
  const parsed = parseCalendarDate(isoDate);
  if (!parsed) {
    return new Date(NaN);
  }
  const [h, m, s, ms] = boundary === "end" ? [23, 59, 59, 999] : [0, 0, 0, 0];
  const zoned = new TZDate(
    parsed.year,
    parsed.month - 1,
    parsed.day + offsetDays,
    h,
    m,
    s,
    ms,
    timezone
  );
  // A zoned date serializes with its own offset; keep the UTC form.
  return new Date(zoned.getTime());
}

export function dayRangeInTimezone(
  startDate: string,
  endDate: string,
  timezone: string
): { startInstant: Date; exclusiveEndInstant: Date } {
  return {
    startInstant: dayBoundaryInTimezone(startDate, timezone),
    exclusiveEndInstant: dayBoundaryInTimezone(endDate, timezone, {
      offsetDays: 1,
    }),
  };
}

export const timezoneSchema = z
  .string()
  .optional()
  .default("UTC")
  .refine((timezone) => isValidTimezone(timezone), {
    message: "Invalid IANA timezone",
  });

/**
 * @cc [owner:avervaet,label:product] raw-user-timezone-or-null
 * Returns the client-reported timezone unvalidated, or `null` when none. MUST NOT fall back to a
 * server-side default.
 */
export async function getConversationUserTimezone(
  toolContext?: ToolContext
): Promise<string | null> {
  if (isAgentLoopRunContext(toolContext?.runContext)) {
    const userMessage = toolContext.runContext.conversation.content
      .flat()
      .findLast(isUserMessageType);
    return userMessage?.context.timezone ?? null;
  }

  if (isSandboxFunctionRunContext(toolContext?.runContext)) {
    const context = await toolContext.runContext.invocation.getContext();
    return context?.timezone ?? null;
  }

  return null;
}
