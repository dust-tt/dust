/**
 * Parse an optional string to an integer, returning undefined if not set or invalid.
 */
export function parseOptionalInt(
  value: string | undefined
): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
