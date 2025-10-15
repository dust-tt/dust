import { format } from "date-fns";

export function isValidDate(date: Date) {
  return !isNaN(date.valueOf());
}

export function dateToHumanReadable(date: Date) {
  return format(date, "MMM d, yyyy 'at' h:mm a");
}

export function getTime(date: number): string {
  return format(new Date(date), "HH:mm");
}
