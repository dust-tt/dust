export type ExtractSpecificKeys<T, K extends keyof T> = T extends any
  ? {
      [P in K]: T[P];
    }
  : never;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export function isArrayOf<U, T extends U>(
  value: U[],
  itemChecker: (item: U) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(itemChecker);
}
