/**
 *  Filters out null and undefined values from an array by correctly narrowing the type.
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
