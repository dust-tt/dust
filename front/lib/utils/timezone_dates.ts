export function formatDateInTimezone(date: Date, timezone: string): string {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const weekdayFormatter = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
  });

  const dateStr = dateFormatter.format(date);
  const weekdayStr = weekdayFormatter.format(date);

  return `${dateStr} (${weekdayStr})`;
}

// Formats a date in a specific timezone with the format "MM/DD/YYYY (ddd)"
export function formatCurrentDateInTimezone(
  date: Date,
  timezone: string
): string {
  try {
    return formatDateInTimezone(date, timezone);
  } catch (error) {
    // Fallback to UTC if timezone is invalid
    return formatDateInTimezone(date, "UTC");
  }
}
