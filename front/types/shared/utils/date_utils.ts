import { format } from "date-fns";

function isValidDate(date: Date) {
  return !isNaN(date.valueOf());
}

export function dateToHumanReadable(date: Date) {
  return format(date, "MMM d, yyyy 'at' h:mm a");
}
