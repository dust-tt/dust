/**
 * Equality operator: checks if field exactly equals value.
 *
 * @param fieldValue - The value from the payload
 * @param value - The expected value
 * @returns true if fieldValue === value
 */
export function eq(fieldValue: unknown, value: unknown): boolean {
  return fieldValue === value;
}
