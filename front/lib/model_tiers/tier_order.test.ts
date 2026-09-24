import {
  expandTiersUpTo,
  getMaxTierName,
  isPremiumOrAboveTier,
  isTierAtLeast,
  isTierWithinMax,
} from "@app/lib/model_tiers/tier_order";
import { describe, expect, it } from "vitest";

describe("tier_order", () => {
  it("expands tiers up to the selected ceiling", () => {
    expect(expandTiersUpTo("cost_efficient")).toEqual(["cost_efficient"]);
    expect(expandTiersUpTo("balanced")).toEqual(["cost_efficient", "balanced"]);
    expect(expandTiersUpTo("premium")).toEqual([
      "cost_efficient",
      "balanced",
      "premium",
    ]);
    expect(expandTiersUpTo("ultra")).toEqual([
      "cost_efficient",
      "balanced",
      "premium",
      "ultra",
    ]);
  });

  it("returns the highest granted tier", () => {
    expect(
      getMaxTierName(["cost_efficient", "balanced", "cost_efficient"])
    ).toBe("balanced");
  });

  it("checks tier inclusion against a ceiling", () => {
    expect(isTierWithinMax("cost_efficient", "balanced")).toBe(true);
    expect(isTierWithinMax("premium", "balanced")).toBe(false);
  });

  it("checks tier inclusion against a floor", () => {
    expect(isTierAtLeast("premium", "premium")).toBe(true);
    expect(isTierAtLeast("ultra", "premium")).toBe(true);
    expect(isTierAtLeast("balanced", "premium")).toBe(false);
  });

  it("treats Premium and every tier above it as premium, and no tier as below", () => {
    expect(isPremiumOrAboveTier("premium")).toBe(true);
    expect(isPremiumOrAboveTier("ultra")).toBe(true);
    expect(isPremiumOrAboveTier("balanced")).toBe(false);
    expect(isPremiumOrAboveTier(null)).toBe(false);
  });
});
