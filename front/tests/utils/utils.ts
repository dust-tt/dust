import { expect } from "vitest";

export const expectArrayOfObjectsWithSpecificLength = (
  value: any,
  length: number
) => {
  expect(Array.isArray(value)).toBe(true);
  expect(value).toHaveLength(length);
  expect(
    value.every((item: unknown) => typeof item === "object" && item !== null)
  ).toBe(true);
};
