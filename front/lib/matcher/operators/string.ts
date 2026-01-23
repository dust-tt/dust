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

/**
 * String contains operator: checks if string contains substring.
 *
 * @param fieldValue - The value from the payload
 * @param substring - The expected substring
 * @returns true if fieldValue contains substring
 */
export function contains(fieldValue: unknown, substring: unknown): boolean {
  if (typeof fieldValue !== "string" || typeof substring !== "string") {
    return false;
  }
  return fieldValue.includes(substring);
}
