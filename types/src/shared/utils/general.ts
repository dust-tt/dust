/**
 *  Filters out nulls & undefineds from an array by correclty narrowing the type
 */
export function removeNulls<T>(arr: (T | null)[]): T[] {
  return arr.filter((v): v is T => v !== null);
}
