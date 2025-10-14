/**
 * String starts-with operator: checks if string starts with prefix.
 *
 * @param fieldValue - The value from the payload
 * @param prefix - The expected prefix
 * @returns true if fieldValue starts with prefix
 */
export function startsWith(fieldValue: unknown, prefix: unknown): boolean {
  if (typeof fieldValue !== "string" || typeof prefix !== "string") {
    return false;
  }
  return fieldValue.startsWith(prefix);
}
