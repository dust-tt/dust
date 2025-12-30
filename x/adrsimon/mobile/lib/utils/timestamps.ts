/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param durationMs - The duration in milliseconds
 * @returns A formatted string like "9 min 12 sec" or "45 sec"
 */
export function formatDurationString(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    if (seconds === 0) {
      return `${minutes} min`;
    }
    return `${minutes} min ${seconds} sec`;
  }
  return `${seconds} sec`;
}

/**
 * Formats a timestamp to a relative time string.
 * @param timestamp - Unix timestamp in milliseconds
 * @returns A formatted string like "just now", "5 min ago", "2 hours ago", etc.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
  }

  // Fallback to date string for older messages
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
