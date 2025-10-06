/**
 *  Filters out nulls & undefineds from an array by correclty narrowing the type
 */
export function removeNulls<T>(arr: (T | null | undefined)[]): T[] {
  return arr.filter((v): v is T => v !== null && v !== undefined);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isEmptyString(str: string | null | undefined): boolean {
  if (str === null || str === undefined) {
    return true;
  }
  return str.trim() === "";
}

const POSTGRES_DEFAULT_STRING_MAX_LENGTH = 255;

// Util function used to check that a string is not overflowing the default STRING reprensentation
// in DB (VARCHAR(255).
export function isOverflowingDBString(
  str: string | null | undefined,
  maxLength?: number
): boolean {
  if (str === null || str === undefined) {
    return false;
  }
  return str.length > (maxLength ?? POSTGRES_DEFAULT_STRING_MAX_LENGTH);
}
