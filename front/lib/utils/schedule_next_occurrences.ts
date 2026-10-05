import type {
  IntervalScheduleConfig,
  ScheduleConfig,
} from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import {
  DAYS_PER_WEEK,
  ONE_MINUTE_MS,
  resolveCalendarDate,
} from "@app/types/shared/utils/date_utils";
import { tzOffset } from "@date-fns/tz";
import { CronExpressionParser } from "cron-parser";

export function getNextOccurrences(
  config: ScheduleConfig,
  count: number
): Date[] {
  if (isCronScheduleConfig(config)) {
    return getNextCronOccurrences(config.cron, config.timezone, count);
  }
  return getNextIntervalOccurrences(config, count);
}

function getNextCronOccurrences(
  cron: string,
  timezone: string,
  count: number
): Date[] {
  try {
    const expression = CronExpressionParser.parse(cron, { tz: timezone });
    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      dates.push(expression.next().toDate());
    }
    return dates;
  } catch {
    return [];
  }
}

/**
 * @cc [owner:aubin-tchoi,label:product] interval-calendar-days
 * Occurrences MUST be strictly after now and advance by local calendar days in the
 * configured timezone, rather than fixed 24-hour durations. A time moved forward
 * through a DST gap MUST remain the basis for subsequent interval occurrences.
 * A repeated clock time resolves to its earlier occurrence. Results MUST NOT
 * depend on the host timezone.
 */
function getNextIntervalOccurrences(
  config: IntervalScheduleConfig,
  count: number
): Date[] {
  const now = new Date();
  // UTC fields hold the configured zone's calendar fields, avoiding host DST.
  const calendarDate = new Date(
    now.getTime() + tzOffset(config.timezone, now) * ONE_MINUTE_MS
  );
  calendarDate.setUTCHours(config.hour, config.minute, 0, 0);

  function resolveCandidate(): Date {
    const candidate = resolveCalendarDate(calendarDate, config.timezone);
    // Preserve any forward adjustment through a gap for subsequent occurrences.
    calendarDate.setTime(
      candidate.getTime() + tzOffset(config.timezone, candidate) * ONE_MINUTE_MS
    );
    return candidate;
  }

  let candidate = resolveCandidate();
  if (config.dayOfWeek !== null) {
    const daysUntil =
      (config.dayOfWeek - calendarDate.getUTCDay() + DAYS_PER_WEEK) %
      DAYS_PER_WEEK;
    calendarDate.setUTCDate(calendarDate.getUTCDate() + daysUntil);
    candidate = resolveCandidate();
  }
  if (candidate <= now) {
    const daysUntil = config.dayOfWeek !== null ? config.intervalDays : 1;
    calendarDate.setUTCDate(calendarDate.getUTCDate() + daysUntil);
    candidate = resolveCandidate();
  }

  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(candidate);
    calendarDate.setUTCDate(calendarDate.getUTCDate() + config.intervalDays);
    candidate = resolveCandidate();
  }

  return dates;
}
