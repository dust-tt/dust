import {
  computeActivationFromCells,
  MIN_DISTINCT_WEEKS,
  MIN_HVUC_DAYS,
  type UserDayCell,
} from "@app/lib/api/activation/evaluator";
import { describe, expect, it } from "vitest";

// June 1 2026 is a Monday (UTC), so these fall into consecutive ISO weeks:
//   week A: Jun 1-7, week B: Jun 8-14, week C: Jun 15-21, week D: Jun 22-28.
const dayMs = (day: number) => Date.UTC(2026, 5, day);

function cell(
  day: number,
  { isDau = true, isHvuc = true }: { isDau?: boolean; isHvuc?: boolean } = {}
): UserDayCell {
  return { userId: "u1", dayMs: dayMs(day), isDau, isHvuc };
}

describe("computeActivationFromCells", () => {
  it("guards the thresholds it is written against", () => {
    // The scenarios below assume the canonical 6-days / 3-weeks bar.
    expect(MIN_HVUC_DAYS).toBe(6);
    expect(MIN_DISTINCT_WEEKS).toBe(3);
  });

  it("activates on ≥6 HVUC days spanning ≥3 distinct weeks", () => {
    const cells = [
      cell(1),
      cell(2), // week A
      cell(8),
      cell(9), // week B
      cell(15),
      cell(16), // week C
    ];

    const result = computeActivationFromCells(cells);

    expect(result.activated).toBe(true);
    expect(result.hvucDays).toBe(6);
    expect(result.hvucWeeks).toBe(3);
    expect(result.evidence.qualifyingWeeks).toHaveLength(3);
  });

  it("does not activate with enough days but too few distinct weeks", () => {
    // 6 HVUC days, all within the same ISO week (Mon-Sat).
    const cells = [cell(1), cell(2), cell(3), cell(4), cell(5), cell(6)];

    const result = computeActivationFromCells(cells);

    expect(result.hvucDays).toBe(6);
    expect(result.hvucWeeks).toBe(1);
    expect(result.activated).toBe(false);
  });

  it("does not activate with enough weeks but too few days", () => {
    // 5 HVUC days across 3 weeks.
    const cells = [cell(1), cell(8), cell(9), cell(15), cell(16)];

    const result = computeActivationFromCells(cells);

    expect(result.hvucDays).toBe(5);
    expect(result.hvucWeeks).toBe(3);
    expect(result.activated).toBe(false);
  });

  it("ignores non-DAU days (an HVUC signal without a human message)", () => {
    const cells = [
      cell(1),
      cell(2),
      cell(8),
      cell(9),
      cell(15),
      cell(16, { isDau: false }), // HVUC signal but not a DAU day → excluded.
    ];

    const result = computeActivationFromCells(cells);

    expect(result.hvucDays).toBe(5);
    expect(result.activated).toBe(false);
  });

  it("ignores DAU days without an HVUC signal", () => {
    const cells = [
      cell(1),
      cell(2),
      cell(8),
      cell(9),
      cell(15),
      cell(16, { isHvuc: false }), // DAU but no HVUC signal → excluded.
    ];

    const result = computeActivationFromCells(cells);

    expect(result.hvucDays).toBe(5);
    expect(result.activated).toBe(false);
  });
});
