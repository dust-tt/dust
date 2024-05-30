import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  set,
  startOfMonth,
  startOfToday,
} from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { ScheduledAgentResource } from "@app/lib/resources/scheduled_agent_resource";

// Returns the number of milliseconds to wait before running the scheduled agent.
export async function computeWaitTime(
  scheduledAgentId: string
): Promise<number> {
  const scheduledAgent = await ScheduledAgentResource.getBySid(
    scheduledAgentId
  );
  if (!scheduledAgent) {
    throw new Error(`Scheduled agent not found.`);
  }

  const schedule: ISchedule = {
    timeOfDay: scheduledAgent.timeOfDay,
    timeZone: scheduledAgent.timeZone,
    scheduleType: scheduledAgent.scheduleType,
    weeklyDaysOfWeek: scheduledAgent.weeklyDaysOfWeek ?? undefined,
    monthlyDayOfWeek: scheduledAgent.monthlyDayOfWeek ?? undefined,
    monthlyFirstLast: scheduledAgent.monthlyFirstLast ?? undefined,
  };

  return calculateMillisecondsUntilNextSchedule(schedule);
}

// Define the schedule interface
interface ISchedule {
  timeOfDay: string; // Format: "HH:MM:SS"
  timeZone: string;
  scheduleType: "weekly" | "monthly";
  weeklyDaysOfWeek?: number[]; // Only for weekly schedules
  monthlyFirstLast?: "first" | "last"; // Only for monthly schedules
  monthlyDayOfWeek?: number; // Only for monthly schedules
}

// Calculate the next occurrence for weekly schedules with timezone support
function getNextWeeklyOccurrence(
  schedule: ISchedule & { scheduleType: "weekly" }
): Date {
  const weeklyDaysOfWeek = schedule.weeklyDaysOfWeek;

  if (!weeklyDaysOfWeek?.length) {
    throw new Error("weeklyDaysOfWeek is required for weekly schedules");
  }

  const today = startOfToday();
  const scheduleTime = schedule.timeOfDay.split(":").map(Number);

  // Initialize next occurrence to today's date with the scheduled time.
  let nextOccurrence = fromZonedTime(
    set(today, {
      hours: scheduleTime[0],
      minutes: scheduleTime[1],
      seconds: scheduleTime[2],
    }),
    schedule.timeZone
  );

  // Ensure days of the week are sorted.
  const daysOfWeek = weeklyDaysOfWeek.sort((a, b) => a - b);
  const currDayInTz = getDayOfWeekInTimezone(today, schedule.timeZone);

  // Find the closest day of week that is greater or equal to the current day of week.
  const closestDay = daysOfWeek.find((day) => day >= currDayInTz);

  // If the closest day is today, and time has passed, skip to next day.
  if (closestDay === currDayInTz && nextOccurrence <= new Date()) {
    const nextDayIndex = daysOfWeek.indexOf(closestDay) + 1;
    const targetDayOfWeek = daysOfWeek[nextDayIndex % daysOfWeek.length];
    while (
      getDayOfWeekInTimezone(nextOccurrence, schedule.timeZone) !==
      targetDayOfWeek
    ) {
      nextOccurrence = addDays(nextOccurrence, 1);
    }
    return nextOccurrence;
  } else if (closestDay === undefined) {
    const targetDayOfWeek = daysOfWeek[0];
    while (
      getDayOfWeekInTimezone(nextOccurrence, schedule.timeZone) !==
      targetDayOfWeek
    ) {
      nextOccurrence = addDays(nextOccurrence, 1);
    }
  }

  return nextOccurrence;
}

// Calculate the next occurrence for monthly schedules with timezone support
function getNextMonthlyOccurrence(
  schedule: ISchedule & { scheduleType: "monthly" },
  monthsOffset = 0
): Date {
  const { timeOfDay, monthlyFirstLast, monthlyDayOfWeek } = schedule;

  if (!monthlyDayOfWeek || !monthlyFirstLast) {
    throw new Error("monthlyDayOfWeek and monthlyFirstLast are required");
  }

  const scheduleTime = timeOfDay.split(":").map(Number);
  // Start from the next month

  const { startOfMonthUtc, endOfMonthUtc } = getBeginningAndEndOfMonth(
    schedule.timeZone,
    monthsOffset
  );

  // List all days in the next month
  const daysInMonth = eachDayOfInterval({
    start: startOfMonthUtc,
    end: endOfMonthUtc,
  });

  // Filter days that match the specified day of the week
  const validDays = daysInMonth.filter(
    (day) => getDayOfWeekInTimezone(day, schedule.timeZone) === monthlyDayOfWeek
  );

  // Select the first or last valid day based on the schedule configuration
  const validDay =
    monthlyFirstLast === "first"
      ? validDays[0]
      : validDays[validDays.length - 1];

  // Set the time for the valid day
  const dayWithTime = set(validDay, {
    hours: scheduleTime[0],
    minutes: scheduleTime[1],
    seconds: scheduleTime[2],
  });

  if (dayWithTime <= new Date()) {
    return getNextMonthlyOccurrence(schedule, monthsOffset + 1);
  }

  return dayWithTime;
}

// Calculate milliseconds until the next schedule with timezone support
function calculateMillisecondsUntilNextSchedule(schedule: ISchedule): number {
  const nextOccurrence =
    schedule.scheduleType === "weekly"
      ? getNextWeeklyOccurrence({ ...schedule, scheduleType: "weekly" })
      : getNextMonthlyOccurrence({ ...schedule, scheduleType: "monthly" });

  return nextOccurrence.getTime() - new Date().getTime();
}

function getDayOfWeekInTimezone(d: Date, timeZone: string) {
  const options: Intl.DateTimeFormatOptions = { timeZone, weekday: "short" };
  const dateTimeFormat = new Intl.DateTimeFormat("en-US", options);
  const formattedDate = dateTimeFormat.format(d);

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return daysOfWeek.indexOf(formattedDate);
}

function getBeginningAndEndOfMonth(timeZone: string, monthsOffset = 0) {
  let now = new Date();
  if (monthsOffset !== 0) {
    now = addMonths(now, monthsOffset);
  }

  // Get the start and end of the month in the local timezone
  const startOfMonthDate = startOfMonth(toZonedTime(now, timeZone));
  const endOfMonthDate = endOfMonth(toZonedTime(now, timeZone));

  // Convert the start and end of the month to UTC
  const startOfMonthUtc = fromZonedTime(startOfMonthDate, timeZone);
  const endOfMonthUtc = fromZonedTime(endOfMonthDate, timeZone);

  return { startOfMonthUtc, endOfMonthUtc };
}
