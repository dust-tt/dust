import {
  creditsToMicroCredits,
  microCreditsToCredits,
} from "@app/lib/credits/units";
import { describe, expect, it } from "vitest";

describe("credit units", () => {
  it("converts credits to integer microcredits with one rounding rule", () => {
    expect(creditsToMicroCredits(1)).toBe(1_000_000);
    expect(creditsToMicroCredits(0.1234567)).toBe(123_457);
  });

  it("converts persisted microcredits back to credits", () => {
    expect(microCreditsToCredits(1)).toBe(0.000001);
    expect(microCreditsToCredits(1_250_000)).toBe(1.25);
  });
});
