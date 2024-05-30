import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  getDay,
  getISODay,
  set,
  startOfMonth,
  startOfToday,
} from "date-fns";

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
  let nextOccurrence = set(today, {
    hours: scheduleTime[0],
    minutes: scheduleTime[1],
    seconds: scheduleTime[2],
  });

  // Ensure days of the week are sorted.
  const daysOfWeek = weeklyDaysOfWeek.sort((a, b) => a - b);

  // Find the closest day of week that is greater or equal to the current day of week.
  let closestDay = daysOfWeek.find((day) => day >= getISODay(today));

  // If the closest day is today, and time has passed, skip to next day.
  if (closestDay === getISODay(today) && nextOccurrence <= new Date()) {
    const nextDayIndex = daysOfWeek.indexOf(closestDay) + 1;
    if (nextDayIndex < daysOfWeek.length) {
      closestDay = daysOfWeek[nextDayIndex];
      const daysDelta = (closestDay - getISODay(today) + 7) % 7;
      nextOccurrence = addDays(nextOccurrence, daysDelta);
    } else {
      // If no more days are left in the current week, move to the first day of the next week.
      closestDay = daysOfWeek[0];
      nextOccurrence = addWeeks(nextOccurrence, 1);
      const daysDelta = (closestDay - getISODay(today) + 7) % 7;
      nextOccurrence = addDays(nextOccurrence, daysDelta);
    }
  } else if (closestDay === undefined) {
    // No days of week are greater than the current day of week.
    // We use the first scheduled day of the next week.
    closestDay = daysOfWeek[0];
    nextOccurrence = addWeeks(nextOccurrence, 1);
  }
  // Compute the number of days to add to the next occurrence.
  const daysDelta = (closestDay - getISODay(today) + 7) % 7;
  nextOccurrence = addDays(nextOccurrence, daysDelta);
  // return zonedTimeToUtc(nextOccurrence, schedule.timeZone);
  return nextOccurrence;
}

// Calculate the next occurrence for monthly schedules with timezone support
function getNextMonthlyOccurrence(
  schedule: ISchedule & { scheduleType: "monthly" }
): Date {
  const { timeOfDay, monthlyFirstLast, monthlyDayOfWeek } = schedule;

  if (!monthlyDayOfWeek || !monthlyFirstLast) {
    throw new Error("monthlyDayOfWeek and monthlyFirstLast are required");
  }

  const scheduleTime = timeOfDay.split(":").map(Number);
  // Start from the next month
  const occurrenceMonth = startOfMonth(addMonths(new Date(), 1));

  // List all days in the next month
  const daysInMonth = eachDayOfInterval({
    start: occurrenceMonth,
    end: endOfMonth(occurrenceMonth),
  });

  // Filter days that match the specified day of the week
  const validDays = daysInMonth.filter(
    (day) => getDay(day) === monthlyDayOfWeek
  );

  // Select the first or last valid day based on the schedule configuration
  const validDay =
    monthlyFirstLast === "first"
      ? validDays[0]
      : validDays[validDays.length - 1];

  // Set the time for the valid day
  return set(validDay, {
    hours: scheduleTime[0],
    minutes: scheduleTime[1],
    seconds: scheduleTime[2],
  });
}

// Calculate milliseconds until the next schedule with timezone support
function calculateMillisecondsUntilNextSchedule(schedule: ISchedule): number {
  const nextOccurrence =
    schedule.scheduleType === "weekly"
      ? getNextWeeklyOccurrence({ ...schedule, scheduleType: "weekly" })
      : getNextMonthlyOccurrence({ ...schedule, scheduleType: "monthly" });

  return nextOccurrence.getTime() - new Date().getTime();
}

const ms = calculateMillisecondsUntilNextSchedule({
  timeOfDay: "15:00:00",
  timeZone: "Europe/Paris",
  scheduleType: "weekly",
  weeklyDaysOfWeek: [5, 1, 3], // Monday, Wednesday, Friday (unsorted input)
});
console.log(`Milliseconds until next schedule: ${ms}`);
const occurrence = new Date(Date.now() + ms);
// Display the next occurrence with timezone support
console.log(`Next occurrence: ${occurrence}`);
