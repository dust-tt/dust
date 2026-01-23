/**
 * Array has operator: checks if array contains a specific value.
 *
 * @param fieldValue - The array from the payload
 * @param value - The value to check for
 * @returns true if fieldValue array contains value
 */
export function has(fieldValue: unknown, value: unknown): boolean {
  if (!Array.isArray(fieldValue)) {
    return false;
  }
  return fieldValue.includes(value);
}

/**
 * Array has-all operator: checks if array contains all specified values.
 *
 * @param fieldValue - The array from the payload
 * @param values - The values that must all be present
 * @returns true if fieldValue array contains all values
 */
export function hasAll(fieldValue: unknown, values: unknown[]): boolean {
  if (!Array.isArray(fieldValue)) {
    return false;
  }
  return values.every((value) => fieldValue.includes(value));
}

/**
 * Array has-any operator: checks if array contains at least one of the specified values.
 *
 * @param fieldValue - The array from the payload
 * @param values - The values to check for
 * @returns true if fieldValue array contains at least one value
 */
export function hasAny(fieldValue: unknown, values: unknown[]): boolean {
  if (!Array.isArray(fieldValue)) {
    return false;
  }
  return values.some((value) => fieldValue.includes(value));
}
