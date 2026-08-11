import {
  resolveEffectiveSpendLimitAwuCredits,
  resolveEffectiveSpendLimitSource,
} from "@app/lib/spend_limits/effective";
import { describe, expect, it } from "vitest";

describe("resolveEffectiveSpendLimitAwuCredits", () => {
  it("prefers the override, then the group cap, then the default", () => {
    expect(
      resolveEffectiveSpendLimitAwuCredits({
        overrideAwuCredits: 100,
        overrideUnlimited: false,
        groupCapAwuCredits: 200,
        defaultAwuCredits: 300,
      })
    ).toBe(100);

    expect(
      resolveEffectiveSpendLimitAwuCredits({
        overrideAwuCredits: null,
        overrideUnlimited: false,
        groupCapAwuCredits: 200,
        defaultAwuCredits: 300,
      })
    ).toBe(200);

    expect(
      resolveEffectiveSpendLimitAwuCredits({
        overrideAwuCredits: null,
        overrideUnlimited: false,
        groupCapAwuCredits: null,
        defaultAwuCredits: 300,
      })
    ).toBe(300);
  });

  it("returns null when nothing is configured", () => {
    expect(
      resolveEffectiveSpendLimitAwuCredits({
        overrideAwuCredits: null,
        overrideUnlimited: false,
        groupCapAwuCredits: null,
        defaultAwuCredits: null,
      })
    ).toBeNull();
  });

  it("treats a 0 group cap as a real cap, not as unset", () => {
    expect(
      resolveEffectiveSpendLimitAwuCredits({
        overrideAwuCredits: null,
        overrideUnlimited: false,
        groupCapAwuCredits: 0,
        defaultAwuCredits: 300,
      })
    ).toBe(0);
  });

  it("bypasses the group cap and default entirely when explicitly unlimited", () => {
    expect(
      resolveEffectiveSpendLimitAwuCredits({
        overrideAwuCredits: null,
        overrideUnlimited: true,
        groupCapAwuCredits: 200,
        defaultAwuCredits: 300,
      })
    ).toBeNull();
  });
});

describe("resolveEffectiveSpendLimitSource", () => {
  it("reports the winning source following override > group > default > none", () => {
    expect(
      resolveEffectiveSpendLimitSource({
        overrideAwuCredits: 100,
        overrideUnlimited: false,
        groupCapAwuCredits: 200,
        defaultAwuCredits: 300,
      })
    ).toBe("override");

    expect(
      resolveEffectiveSpendLimitSource({
        overrideAwuCredits: null,
        overrideUnlimited: false,
        groupCapAwuCredits: 200,
        defaultAwuCredits: 300,
      })
    ).toBe("group");

    expect(
      resolveEffectiveSpendLimitSource({
        overrideAwuCredits: null,
        overrideUnlimited: false,
        groupCapAwuCredits: null,
        defaultAwuCredits: 300,
      })
    ).toBe("default");

    expect(
      resolveEffectiveSpendLimitSource({
        overrideAwuCredits: null,
        overrideUnlimited: false,
        groupCapAwuCredits: null,
        defaultAwuCredits: null,
      })
    ).toBe("none");
  });

  it("reports 'override' when explicitly unlimited even without a group/default cap", () => {
    expect(
      resolveEffectiveSpendLimitSource({
        overrideAwuCredits: null,
        overrideUnlimited: true,
        groupCapAwuCredits: 200,
        defaultAwuCredits: 300,
      })
    ).toBe("override");
  });
});
