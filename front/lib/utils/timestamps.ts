export const cleanTimestamp = (
  timestamp: number | string | null | undefined
) => {
  if (timestamp !== null && timestamp !== undefined) {
    const timestampNumber = Number(timestamp);
    if (isNaN(timestampNumber)) {
      return null;
    }

    // Timestamps is in seconds, convert to ms
    if (timestampNumber < (10 ^ 10)) {
      return Math.floor(timestampNumber * 1000);
    }

    return Math.floor(timestampNumber);
  }

  return null;
};

export const formatTimestring = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Formats a duration in milliseconds to a human-readable string.
 * @param durationMs - The duration in milliseconds
 * @returns A formatted string like "9 min 12 sec" or "45 sec"
 */
export const formatDurationString = (durationMs: number): string => {
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
};
