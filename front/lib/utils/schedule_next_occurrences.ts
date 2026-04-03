import type {
  IntervalScheduleConfig,
  ScheduleConfig,
} from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";

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

function getNextIntervalOccurrences(
  config: IntervalScheduleConfig,
  count: number
): Date[] {
  const now = DateTime.now().setZone(config.timezone);
  let candidate = now.set({
    hour: config.hour,
    minute: config.minute,
    second: 0,
    millisecond: 0,
  });

  if (config.dayOfWeek !== null) {
    // Luxon weekdays: 1=Monday..7=Sunday; config uses 0=Sunday..6=Saturday.
    const luxonWeekday =
      config.dayOfWeek === 0 ? DAYS_PER_WEEK : config.dayOfWeek;
    const daysUntil =
      (luxonWeekday - candidate.weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
    candidate = candidate.plus({ days: daysUntil });

    if (candidate <= now) {
      candidate = candidate.plus({ days: config.intervalDays });
    }
  } else {
    if (candidate <= now) {
      candidate = candidate.plus({ days: 1 });
    }
  }

  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(candidate.toJSDate());
    candidate = candidate.plus({ days: config.intervalDays });
  }

  return dates;
}
