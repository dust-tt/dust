export function formatDateFromMillis(ms: number, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(ms));
}

export function getMidnightInTimezone(dateStr: string, timezone: string) {
  const midnightUTC = new Date(dateStr + "T00:00:00Z").getTime();
  const utcStr = new Date(midnightUTC).toLocaleString("en-US", {
    timeZone: "UTC",
  });
  const tzStr = new Date(midnightUTC).toLocaleString("en-US", {
    timeZone: timezone,
  });
  const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
  return midnightUTC + offsetMs;
}

export function getStartOfTodayInTimezone(timezone: string): number {
  const todayStr = formatDateFromMillis(Date.now(), timezone);
  return getMidnightInTimezone(todayStr, timezone);
}
