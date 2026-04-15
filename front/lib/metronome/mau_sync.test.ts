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
// distributeMauAcrossTiers
// ---------------------------------------------------------------------------

describe("distributeMauAcrossTiers", () => {
  it("FLOOR-4-6-8 with 15 MAUs → 3-2-2-8", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    expect(distributeMauAcrossTiers(15, tiers)).toEqual([3, 2, 2, 8]);
  });

  it("FLOOR-4-6-8 with 1 MAU → 1-0-0-0", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    expect(distributeMauAcrossTiers(1, tiers)).toEqual([1, 0, 0, 0]);
  });

  it("FLOOR-4-6-8 with 5 MAUs → 3-2-0-0", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    expect(distributeMauAcrossTiers(5, tiers)).toEqual([3, 2, 0, 0]);
  });

  it("FLOOR-4-6-8 with 3 MAUs → 3-0-0-0", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    expect(distributeMauAcrossTiers(3, tiers)).toEqual([3, 0, 0, 0]);
  });

  it("FLOOR-4-6-8 with 8 MAUs → 3-2-2-1", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    expect(distributeMauAcrossTiers(8, tiers)).toEqual([3, 2, 2, 1]);
  });

  it("FLOOR-101-201 with 150 MAUs → 100-50-0", () => {
    const tiers = parseMauTiers("FLOOR-101-201")!;
    expect(distributeMauAcrossTiers(150, tiers)).toEqual([100, 50, 0]);
  });

  it("FLOOR-101-201 with 250 MAUs → 100-100-50", () => {
    const tiers = parseMauTiers("FLOOR-101-201")!;
    expect(distributeMauAcrossTiers(250, tiers)).toEqual([100, 100, 50]);
  });

  it("FLOOR-101-201 with 50 MAUs → 50-0-0", () => {
    const tiers = parseMauTiers("FLOOR-101-201")!;
    expect(distributeMauAcrossTiers(50, tiers)).toEqual([50, 0, 0]);
  });

  it("1-101 with 150 MAUs (no floor) → 100-50", () => {
    const tiers = parseMauTiers("1-101")!;
    expect(distributeMauAcrossTiers(150, tiers)).toEqual([100, 50]);
  });

  it("1-101 with 50 MAUs (no floor) → 50-0", () => {
    const tiers = parseMauTiers("1-101")!;
    expect(distributeMauAcrossTiers(50, tiers)).toEqual([50, 0]);
  });

  it("1 with 25 MAUs (single tier) → 25", () => {
    const tiers = parseMauTiers("1")!;
    expect(distributeMauAcrossTiers(25, tiers)).toEqual([25]);
  });

  it("FLOOR-71-101-201-501 with 300 MAUs → 70-30-100-100-0", () => {
    const tiers = parseMauTiers("FLOOR-71-101-201-501")!;
    expect(distributeMauAcrossTiers(300, tiers)).toEqual([70, 30, 100, 100, 0]);
  });

  it("FLOOR-71-101-201-501 with 600 MAUs → 70-30-100-300-100", () => {
    const tiers = parseMauTiers("FLOOR-71-101-201-501")!;
    expect(distributeMauAcrossTiers(600, tiers)).toEqual([
      70, 30, 100, 300, 100,
    ]);
  });

  it("totals always sum to totalMau", () => {
    const tiers = parseMauTiers("FLOOR-4-6-8")!;
    for (const total of [1, 3, 5, 8, 15, 100]) {
      const distributed = distributeMauAcrossTiers(total, tiers);
      expect(distributed.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("totals sum correctly for no-floor tiers", () => {
    const tiers = parseMauTiers("1-101-201")!;
    for (const total of [1, 50, 101, 150, 201, 300]) {
      const distributed = distributeMauAcrossTiers(total, tiers);
      expect(distributed.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
