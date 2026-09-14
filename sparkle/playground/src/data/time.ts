// One clock for every list that stamps a row with when it last moved, so the
// Inbox, the Pods and the conversations page all read the same way.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

// Past this, minutes stop being the useful unit and the time of day takes over.
const RELATIVE_MINUTES_LIMIT = 20;

/**
 * How long a row has to stay open before it counts as read rather than glanced
 * at, wherever rows carry an unread state.
 */
export const READ_DWELL_MS = 3000;

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

/** The sections a list of what already happened is split into, newest first. */
export const DATE_BUCKET_ORDER = [
  "Today",
  "Yesterday",
  "Last Week",
  "Last Month",
] as const;

export type DateBucket = (typeof DATE_BUCKET_ORDER)[number];

/** Which section something that already happened belongs to. */
export function getDateBucket(date: Date, now: Date = new Date()): DateBucket {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (day.getTime() >= today.getTime()) {
    return "Today";
  }
  if (day.getTime() >= yesterday.getTime()) {
    return "Yesterday";
  }
  if (day.getTime() >= lastWeek.getTime()) {
    return "Last Week";
  }
  return "Last Month";
}

/** The sections a list of what is still to come is split into, soonest first. */
export const FIRE_BUCKETS = [
  "Today",
  "This Week",
  "This Month",
  "Later",
] as const;

export type FireBucket = (typeof FIRE_BUCKETS)[number];

/**
 * Which section something scheduled belongs to, counted forward from today the
 * way the conversation lists count backward from it. Anything already due reads
 * as today, since that is when the reader will see it happen.
 */
export function getFireBucket(date: Date, now: Date = new Date()): FireBucket {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysAway = Math.round(
    (day.getTime() - startOfToday.getTime()) / DAY_MS
  );

  if (daysAway <= 0) {
    return "Today";
  }
  if (daysAway <= 7) {
    return "This Week";
  }
  if (daysAway <= 30) {
    return "This Month";
  }
  return "Later";
}

/**
 * When something scheduled fires next. The time of day is enough while it is
 * still today; past a day away it says nothing about when, so the weekday takes
 * over.
 */
export function formatWakeUpFireLabel(
  date: Date,
  now: Date = new Date()
): string {
  const away = date.getTime() - now.getTime();
  if (away <= DAY_MS) {
    return timeOfDay(date);
  }
  // A weekday still places it inside the coming week; beyond that the name
  // comes back around and only a date says which one it is.
  return away < 7 * DAY_MS
    ? date.toLocaleDateString("en-US", { weekday: "short" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
