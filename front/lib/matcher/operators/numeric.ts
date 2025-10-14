/**
 * Greater than operator: checks if field > value.
 *
 * @param fieldValue - The value from the payload
 * @param value - The value to compare against
 * @returns true if fieldValue > value
 */
export function gt(fieldValue: unknown, value: unknown): boolean {
  if (typeof fieldValue !== "number" || typeof value !== "number") {
    return false;
  }
  return fieldValue > value;
}

/**
 * Greater than or equal operator: checks if field >= value.
 *
 * @param fieldValue - The value from the payload
 * @param value - The value to compare against
 * @returns true if fieldValue >= value
 */
export function gte(fieldValue: unknown, value: unknown): boolean {
  if (typeof fieldValue !== "number" || typeof value !== "number") {
    return false;
  }
  return fieldValue >= value;
}

/**
 * Less than operator: checks if field < value.
 *
 * @param fieldValue - The value from the payload
 * @param value - The value to compare against
 * @returns true if fieldValue < value
 */
export function lt(fieldValue: unknown, value: unknown): boolean {
  if (typeof fieldValue !== "number" || typeof value !== "number") {
    return false;
  }
  return fieldValue < value;
}

/**
 * Less than or equal operator: checks if field <= value.
 *
 * @param fieldValue - The value from the payload
 * @param value - The value to compare against
 * @returns true if fieldValue <= value
 */
export function lte(fieldValue: unknown, value: unknown): boolean {
  if (typeof fieldValue !== "number" || typeof value !== "number") {
    return false;
  }
  return fieldValue <= value;
}
