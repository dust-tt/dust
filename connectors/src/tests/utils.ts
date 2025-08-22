import { expect } from "vitest";

export const expectArrayOfObjectsWithSpecificLength = (
  value: unknown,
  length: number
) => {
  expect(Array.isArray(value)).toBe(true);
  expect(value).toHaveLength(length);
  expect(
    (value as Array<unknown>).every(
      (item: unknown) => typeof item === "object" && item !== null
    )
  ).toBe(true);
};
