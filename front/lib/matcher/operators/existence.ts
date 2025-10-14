/**
 * Exists operator: checks if field exists and is not null/undefined.
 *
 * @param fieldValue - The value from the payload
 * @returns true if fieldValue is not null and not undefined
 */
export function exists(fieldValue: unknown): boolean {
  return fieldValue !== null && fieldValue !== undefined;
}
