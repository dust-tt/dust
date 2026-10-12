import {
  allocateMicroCreditsByLargestRemainder,
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { describe, expect, it } from "vitest";

describe("credit units", () => {
  it("converts credits to integer microcredits with one rounding rule", () => {
    expect(roundCreditsToMicroCredits(1)).toBe(1_000_000);
    expect(roundCreditsToMicroCredits(0.1234564)).toBe(123_456);
    expect(roundCreditsToMicroCredits(0.1234565)).toBe(123_457);
  });

  it("converts persisted microcredits back to credits", () => {
    expect(microCreditsToCredits(1)).toBe(0.000001);
    expect(microCreditsToCredits(1_250_000)).toBe(1.25);
  });

  it("gives the remaining microcredits to the largest fractional parts", () => {
    expect(allocateMicroCreditsByLargestRemainder([1.2, 1.7, 1.1], 4)).toEqual([
      1, 2, 1,
    ]);
  });

  it("breaks ties between equal fractional parts by position", () => {
    expect(
      allocateMicroCreditsByLargestRemainder([1 / 3, 1 / 3, 1 / 3], 1)
    ).toEqual([1, 0, 0]);
  });
});
