// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExtractSpecificKeys<T, K extends keyof T> = T extends any
  ? {
      [P in K]: T[P];
    }
  : never;
