// GC processs may start between 1am and 3am UTC
const GARBAGE_COLLECT_START_TIME_OF_DAY_UTC_WINDOW = {
  start: 1,
  end: 3,
};

// the garbageCollect function will be stopped if it runs longer than this
// (a bit less than 2 hours)
export const GARBAGE_COLLECT_MAX_DURATION_MS = Math.floor(
  1000 * 60 * 60 * 2 * 0.9
);

export function isDuringGarbageCollectStartWindow(): boolean {
  const now = new Date();

  // Convert now to UTC
  now.setMinutes(now.getMinutes() + now.getTimezoneOffset());

  // Create start and end dates using the day, month, year from now
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      GARBAGE_COLLECT_START_TIME_OF_DAY_UTC_WINDOW.start,
      0,
      0,
      0
    )
  );
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      GARBAGE_COLLECT_START_TIME_OF_DAY_UTC_WINDOW.end,
      0,
      0,
      0
    )
  );

  // If now is within the maintenance window, return true
  if (now.getTime() >= start.getTime() && now.getTime() < end.getTime()) {
    return true;
  }

  return false;
}
