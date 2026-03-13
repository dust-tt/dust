import moment from "moment-timezone";

export function formatDateFromMillis(ms: number, timezone: string): string {
  return moment(ms).tz(timezone).format("YYYY-MM-DD");
}

export function getStartOfTodayInTimezone(timezone: string): number {
  return moment.tz(timezone).startOf("day").valueOf();
}
