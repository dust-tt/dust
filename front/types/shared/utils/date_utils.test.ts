import { describe, expect, it } from "vitest";

import { ordinalDay } from "./date_utils";

describe("ordinalDay", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [31, "31st"],
  ])("formats %i as %s", (day, expected) => {
    expect(ordinalDay(day)).toBe(expected);
  });
});
