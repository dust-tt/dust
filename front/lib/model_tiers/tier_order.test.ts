import {
  expandTiersUpTo,
  getMaxTierName,
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
});
