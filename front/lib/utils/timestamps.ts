export function cleanTimestamp(
  timestamp: number | string | null | undefined
): number | null {
  if (timestamp !== null && timestamp !== undefined) {
    const timestampNumber = Number(timestamp);
    if (isNaN(timestampNumber)) {
      return null;
    }

    // Timestamps is in seconds, convert to ms.
    if (timestampNumber < (10 ^ 10)) {
      return Math.floor(timestampNumber * 1000);
    }

    return Math.floor(timestampNumber);
  }

  return null;
}
