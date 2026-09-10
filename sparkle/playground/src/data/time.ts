// One clock for every list that stamps a row with when it last moved, so the
// Inbox, the Pods and the conversations page all read the same way.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Past this, minutes stop being the useful unit and the time of day takes over.
const RELATIVE_MINUTES_LIMIT = 20;

function timeOfDay(date: Date): string {
  return date
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace("24:", "00:");
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/**
 * The timestamp a row carries: minutes while the thread is still warm, then the
 * time of day, prefixed by the day it happened once "today" no longer places it.
 */
export function formatRowTime(date: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / MINUTE_MS);
  if (minutes < RELATIVE_MINUTES_LIMIT) {
    return `${Math.max(minutes, 1)} min ago`;
  }

  if (isSameDay(date, now)) {
    return timeOfDay(date);
  }

  const yesterday = new Date(now.getTime() - DAY_MS);
  if (isSameDay(date, yesterday)) {
    return `Yesterday at ${timeOfDay(date)}`;
  }

  // A weekday still places a row inside the past week; beyond it, the name
  // comes back around and only a date says which one it was.
  const day =
    now.getTime() - date.getTime() < 7 * DAY_MS
      ? date.toLocaleDateString("en-US", { weekday: "long" })
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return `${day}, ${timeOfDay(date)}`;
}
