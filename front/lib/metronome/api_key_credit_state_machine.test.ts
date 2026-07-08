import { expectedApiKeyCreditStateFromUsage } from "@app/lib/metronome/api_key_credit_state_machine";
import { describe, expect, it } from "vitest";

describe("expectedApiKeyCreditStateFromUsage", () => {
  it("is on_pool when there is no cap", () => {
    expect(
      expectedApiKeyCreditStateFromUsage({
        spentAwuCredits: 10_000,
        capAwuCredits: null,
      })
    ).toBe("on_pool");
  });

  it("is on_pool when spend is below the cap", () => {
    expect(
      expectedApiKeyCreditStateFromUsage({
        spentAwuCredits: 50,
        capAwuCredits: 100,
      })
    ).toBe("on_pool");
  });

  it("is capped when spend reaches the cap", () => {
    expect(
      expectedApiKeyCreditStateFromUsage({
        spentAwuCredits: 100,
        capAwuCredits: 100,
      })
    ).toBe("capped");
  });

  it("is capped when spend exceeds the cap", () => {
    expect(
      expectedApiKeyCreditStateFromUsage({
        spentAwuCredits: 150,
        capAwuCredits: 100,
      })
    ).toBe("capped");
  });
});
