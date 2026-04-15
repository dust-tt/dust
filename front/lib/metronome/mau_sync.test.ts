import {
  distributeMauAcrossTiers,
  parseMauTiers,
} from "@app/lib/metronome/mau_sync";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// parseMauTiers
// ---------------------------------------------------------------------------

describe("parseMauTiers", () => {
  it("returns undefined for undefined input", () => {
    expect(parseMauTiers(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseMauTiers("")).toBeUndefined();
  });

  it("parses FLOOR-101-201 (3 tiers with floor)", () => {
    const tiers = parseMauTiers("FLOOR-101-201");
    expect(tiers).toEqual([
      { start: 1, end: 101, isFloor: true },
      { start: 101, end: 201, isFloor: false },
      { start: 201, end: undefined, isFloor: false },
    ]);
  });

  it("parses FLOOR-4-6-8 (4 tiers with floor)", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8");
    expect(tiers).toEqual([
      { start: 1, end: 4, isFloor: true },
      { start: 4, end: 6, isFloor: false },
      { start: 6, end: 8, isFloor: false },
      { start: 8, end: undefined, isFloor: false },
    ]);
  });

  it("parses 1-101 (2 tiers, no floor)", () => {
    const tiers = parseMauTiers("1-101");
    expect(tiers).toEqual([
      { start: 1, end: 101, isFloor: false },
      { start: 101, end: undefined, isFloor: false },
    ]);
  });

  it("parses 1 (single tier, no floor)", () => {
    const tiers = parseMauTiers("1");
    expect(tiers).toEqual([{ start: 1, end: undefined, isFloor: false }]);
  });

  it("parses FLOOR-71-101-201-501 (5 tiers with floor)", () => {
    const tiers = parseMauTiers("FLOOR-71-101-201-501");
    expect(tiers).toEqual([
      { start: 1, end: 71, isFloor: true },
      { start: 71, end: 101, isFloor: false },
      { start: 101, end: 201, isFloor: false },
      { start: 201, end: 501, isFloor: false },
      { start: 501, end: undefined, isFloor: false },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build SubscriptionInfo[] from tiers with all quantities at 0. */
function makeSubscriptions(tiersField: string) {
  const tiers = parseMauTiers(tiersField)!;
  return tiers.map((tier, i) => ({
    id: `sub-${i}`,
    currentQuantity: 0,
    nextPeriodStart: undefined,
    tier,
  }));
}

/** Extract just the new quantities from the result. */
function quantities(
  result: ReturnType<typeof distributeMauAcrossTiers>
): number[] {
  return result.map((s) => s.currentQuantity);
}

// ---------------------------------------------------------------------------
// distributeMauAcrossTiers
// ---------------------------------------------------------------------------

describe("distributeMauAcrossTiers", () => {
  // Note: distributeMauAcrossTiers only returns entries whose quantity changed.
  // Since makeSubscriptions starts at 0, tiers that compute to 0 are filtered out.

  it("FLOOR-4-6-8 with 15 MAUs → all tiers change", () => {
    const subs = makeSubscriptions("FLOOR-4-6-8");
    expect(quantities(distributeMauAcrossTiers(15, subs))).toEqual([
      3, 2, 2, 8,
    ]);
  });

  it("FLOOR-4-6-8 with 1 MAU → only tier 1 changes", () => {
    const subs = makeSubscriptions("FLOOR-4-6-8");
    const result = distributeMauAcrossTiers(1, subs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sub-0");
    expect(result[0].currentQuantity).toBe(1);
  });

  it("FLOOR-4-6-8 with 5 MAUs → tiers 1-2 change", () => {
    const subs = makeSubscriptions("FLOOR-4-6-8");
    const result = distributeMauAcrossTiers(5, subs);
    expect(result).toHaveLength(2);
    expect(quantities(result)).toEqual([3, 2]);
  });

  it("FLOOR-4-6-8 with 3 MAUs → only tier 1 changes", () => {
    const subs = makeSubscriptions("FLOOR-4-6-8");
    const result = distributeMauAcrossTiers(3, subs);
    expect(result).toHaveLength(1);
    expect(result[0].currentQuantity).toBe(3);
  });

  it("FLOOR-4-6-8 with 8 MAUs → all tiers change", () => {
    const subs = makeSubscriptions("FLOOR-4-6-8");
    expect(quantities(distributeMauAcrossTiers(8, subs))).toEqual([3, 2, 2, 1]);
  });

  it("FLOOR-101-201 with 150 MAUs → tiers 1-2 change", () => {
    const subs = makeSubscriptions("FLOOR-101-201");
    expect(quantities(distributeMauAcrossTiers(150, subs))).toEqual([100, 50]);
  });

  it("FLOOR-101-201 with 250 MAUs → all tiers change", () => {
    const subs = makeSubscriptions("FLOOR-101-201");
    expect(quantities(distributeMauAcrossTiers(250, subs))).toEqual([
      100, 100, 50,
    ]);
  });

  it("FLOOR-101-201 with 50 MAUs → only tier 1 changes", () => {
    const subs = makeSubscriptions("FLOOR-101-201");
    const result = distributeMauAcrossTiers(50, subs);
    expect(result).toHaveLength(1);
    expect(result[0].currentQuantity).toBe(50);
  });

  it("1-101 with 150 MAUs (no floor) → both tiers change", () => {
    const subs = makeSubscriptions("1-101");
    expect(quantities(distributeMauAcrossTiers(150, subs))).toEqual([100, 50]);
  });

  it("1-101 with 50 MAUs (no floor) → only tier 1 changes", () => {
    const subs = makeSubscriptions("1-101");
    const result = distributeMauAcrossTiers(50, subs);
    expect(result).toHaveLength(1);
    expect(result[0].currentQuantity).toBe(50);
  });

  it("1 with 25 MAUs (single tier) → changes", () => {
    const subs = makeSubscriptions("1");
    expect(quantities(distributeMauAcrossTiers(25, subs))).toEqual([25]);
  });

  it("FLOOR-71-101-201-501 with 300 MAUs → tiers 1-4 change", () => {
    const subs = makeSubscriptions("FLOOR-71-101-201-501");
    expect(quantities(distributeMauAcrossTiers(300, subs))).toEqual([
      70, 30, 100, 100,
    ]);
  });

  it("FLOOR-71-101-201-501 with 600 MAUs → all tiers change", () => {
    const subs = makeSubscriptions("FLOOR-71-101-201-501");
    expect(quantities(distributeMauAcrossTiers(600, subs))).toEqual([
      70, 30, 100, 300, 100,
    ]);
  });

  it("returns empty when no quantities changed", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    const subs = tiers.map((tier, i) => ({
      id: `sub-${i}`,
      currentQuantity: [3, 2, 2, 8][i],
      nextPeriodStart: undefined,
      tier,
    }));
    // Same total (15) → no changes needed.
    expect(distributeMauAcrossTiers(15, subs)).toEqual([]);
  });

  it("returns only changed tiers on partial update", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    // Current: 3-2-2-8 (15 MAUs). Update to 20 → 3-2-2-13. Only tier 4 changes.
    const subs = tiers.map((tier, i) => ({
      id: `sub-${i}`,
      currentQuantity: [3, 2, 2, 8][i],
      nextPeriodStart: undefined,
      tier,
    }));
    const result = distributeMauAcrossTiers(20, subs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sub-3");
    expect(result[0].currentQuantity).toBe(13);
  });

  it("total of changed entries matches expected non-zero tiers", () => {
    // With 15 MAUs across FLOOR-4-6-8: all tiers get non-zero → sum = 15
    const subs = makeSubscriptions("FLOOR-4-6-8");
    const result = distributeMauAcrossTiers(15, subs);
    expect(result.reduce((a, b) => a + b.currentQuantity, 0)).toBe(15);
  });

  it("total of changed entries for no-floor tiers", () => {
    // With 150 MAUs across 1-101: both tiers non-zero → sum = 150
    const subs = makeSubscriptions("1-101");
    const result = distributeMauAcrossTiers(150, subs);
    expect(result.reduce((a, b) => a + b.currentQuantity, 0)).toBe(150);
  });
});
