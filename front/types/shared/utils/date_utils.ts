import { format } from "date-fns";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export function isValidDate(date: Date) {
  return !isNaN(date.valueOf());
}

export function dateToHumanReadable(date: Date) {
  return format(date, "MMM d, yyyy 'at' h:mm a");
}

export function ordinalDay(day: number): string {
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";

  return `${day}${suffix}`;
}

export function getTime(date: number): string {
  return format(new Date(date), "HH:mm");
}
