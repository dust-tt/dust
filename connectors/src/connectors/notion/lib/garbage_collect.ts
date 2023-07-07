// GC processs may start between 1am and 3am UTC
const GARBAGE_COLLECT_START_TIME_OF_DAY_UTC_WINDOW = {
  start: 1,
  end: 3,
};

// the garbageCollect function will be stopped if it runs longer than this
// (a bit less than 2 hours). This includes retries.
export const GARBAGE_COLLECT_MAX_DURATION_MS = Math.floor(
  1000 * 60 * 60 * 2 * 0.9
);

export function isDuringGarbageCollectStartWindow(): boolean {
  const now = new Date();

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

  return now.getTime() >= start.getTime() && now.getTime() < end.getTime();
}
