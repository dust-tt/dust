import type {
  IntervalScheduleConfig,
  ScheduleConfig,
} from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import { TZDateMini } from "@date-fns/tz";
import { CronExpressionParser } from "cron-parser";

const DAYS_PER_WEEK = 7;

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
 * A repeated clock time resolves to its earlier occurrence.
 */
function getNextIntervalOccurrences(
  config: IntervalScheduleConfig,
  count: number
): Date[] {
  const now = new Date();
  const candidate = new TZDateMini(now, config.timezone);
  candidate.setHours(config.hour, config.minute, 0, 0);

  if (config.dayOfWeek !== null) {
    const daysUntil =
      (config.dayOfWeek - candidate.getDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    candidate.setDate(candidate.getDate() + daysUntil);
    if (candidate <= now) {
      candidate.setDate(candidate.getDate() + config.intervalDays);
    }
  } else if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1);
  }

  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(new Date(candidate));
    candidate.setDate(candidate.getDate() + config.intervalDays);
  }

  return dates;
}
