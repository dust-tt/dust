import type { ScheduleConfig } from "@app/types/assistant/triggers";
import { isCronScheduleConfig } from "@app/types/assistant/triggers";
import { pluralize } from "@app/types/shared/utils/string_utils";
import cronstrue from "cronstrue";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function describeScheduleConfig(config: ScheduleConfig): string {
  if (isCronScheduleConfig(config)) {
    return cronstrue.toString(config.cron);
  }

  const time = `${config.hour}:${String(config.minute).padStart(2, "0")}`;

  if (config.dayOfWeek !== null && config.intervalDays % 7 === 0) {
    const weeks = config.intervalDays / 7;
    if (weeks === 1) {
      return `Every ${DAY_NAMES[config.dayOfWeek]} at ${time}`;
    }
    return `Every ${weeks} week${pluralize(weeks)} on ${DAY_NAMES[config.dayOfWeek]} at ${time}`;
  }

  if (config.intervalDays === 1) {
    return `Every day at ${time}`;
  }
  return `Every ${config.intervalDays} day${pluralize(config.intervalDays)} at ${time}`;
}
