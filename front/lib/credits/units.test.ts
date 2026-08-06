import {
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
});
