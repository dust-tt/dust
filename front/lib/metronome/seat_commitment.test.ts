import {
  addDuration,
  commitmentAccessTranches,
  commitmentAmount,
  commitmentMonths,
  commitmentPeriodEnd,
  invoicePeriodWeights,
  maxInvoicePeriods,
} from "@app/lib/metronome/seat_commitment";
import { describe, expect, it } from "vitest";

const start = new Date(Date.UTC(2026, 0, 1));
const oneYear = new Date(Date.UTC(2027, 0, 1));
// 42 days after start (Jan 1 → Feb 12): ~1.39 calendar months.
const sixWeeks = new Date(start.getTime() + 42 * 24 * 60 * 60 * 1000);

describe("addDuration", () => {
  it("adds whole weeks as 7-day steps", () => {
    expect(addDuration(start, 2, "weeks")).toEqual(
      new Date(Date.UTC(2026, 0, 15))
    );
  });

  it("adds calendar months and years", () => {
    expect(addDuration(start, 2, "months")).toEqual(
      new Date(Date.UTC(2026, 2, 1))
    );
    expect(addDuration(start, 1, "years")).toEqual(oneYear);
  });

  it("clamps month overflow to the last day of the target month", () => {
    // Jan 31 + 1 month → Feb 28 (2026 is not a leap year).
    expect(addDuration(new Date(Date.UTC(2026, 0, 31)), 1, "months")).toEqual(
      new Date(Date.UTC(2026, 1, 28))
    );
  });
});

describe("commitmentPeriodEnd", () => {
  it("uses the end date when set", () => {
    expect(commitmentPeriodEnd(start, oneYear)).toEqual(oneYear);
  });

  it("defaults to one year out when open-ended", () => {
    expect(commitmentPeriodEnd(start, undefined)).toEqual(oneYear);
  });
});

describe("commitmentMonths", () => {
  it("is exactly 12 for a one-year span", () => {
    expect(commitmentMonths(start, oneYear)).toBe(12);
  });

  it("is exactly 1 for a one-month span", () => {
    expect(commitmentMonths(start, new Date(Date.UTC(2026, 1, 1)))).toBe(1);
  });

  it("measures the partial trailing month as a calendar fraction", () => {
    // 1 whole month (Jan 1 → Feb 1) + 11/28 of February.
    expect(commitmentMonths(start, sixWeeks)).toBeCloseTo(1 + 11 / 28, 5);
  });

  it("is zero when the end is at or before the start", () => {
    expect(commitmentMonths(start, start)).toBe(0);
  });
});

describe("maxInvoicePeriods", () => {
  it("caps a six-week contract at 2 monthly installments", () => {
    expect(maxInvoicePeriods(start, sixWeeks, "monthly")).toBe(2);
  });

  it("caps a six-week contract at a single quarterly/annual installment", () => {
    expect(maxInvoicePeriods(start, sixWeeks, "quarterly")).toBe(1);
    expect(maxInvoicePeriods(start, sixWeeks, "annually")).toBe(1);
  });

  it("allows a full year of monthly/quarterly installments over a year", () => {
    expect(maxInvoicePeriods(start, oneYear, "monthly")).toBe(12);
    expect(maxInvoicePeriods(start, oneYear, "quarterly")).toBe(4);
    expect(maxInvoicePeriods(start, oneYear, "semi_annually")).toBe(2);
    expect(maxInvoicePeriods(start, oneYear, "annually")).toBe(1);
  });
});

describe("invoicePeriodWeights", () => {
  it("weighs a full first month at 1 and a partial second month at its fraction", () => {
    const [first, second] = invoicePeriodWeights(start, sixWeeks, "monthly", 2);
    expect(first).toBe(1);
    // Jan 1 → Feb 12: second month covers 11 of February's 28 days.
    expect(second).toBeCloseTo(11 / 28, 5);
  });

  it("weighs every installment 1 when all periods are whole", () => {
    expect(invoicePeriodWeights(start, oneYear, "quarterly", 4)).toEqual([
      1, 1, 1, 1,
    ]);
  });
});

describe("commitmentAmount", () => {
  // Real case (Sep 7 2026 21:00 → Oct 19 2026 21:00), all on the hour, so the
  // per-hour proration is exact. A $240/yr seat prorates over the contract's
  // year (365 days); a $20/mo seat prorates over each calendar month.
  const contractStart = new Date(Date.UTC(2026, 8, 7, 21));
  const contractEnd = new Date(Date.UTC(2026, 9, 19, 21));

  it("prorates a yearly seat over the year, matching Metronome", () => {
    expect(
      commitmentAmount({
        minSeats: 1,
        ratePerPeriod: 240,
        isAnnual: true,
        start: contractStart,
        end: contractEnd,
      })
    ).toBeCloseTo(27.616438, 6);
  });

  it("prorates a monthly seat over each month (full first month + partial)", () => {
    // 1 full month (Sep 7 → Oct 7) + 12/31 of Oct → 20 * (1 + 12/31).
    expect(
      commitmentAmount({
        minSeats: 1,
        ratePerPeriod: 20,
        isAnnual: false,
        start: contractStart,
        end: contractEnd,
      })
    ).toBeCloseTo(20 * (1 + 12 / 31), 6);
  });

  it("is a full period rate when the commitment spans exactly one period", () => {
    // Yearly seat over exactly one year, and monthly seat over exactly a year
    // (12 full months) — no proration.
    expect(
      commitmentAmount({
        minSeats: 30,
        ratePerPeriod: 528,
        isAnnual: true,
        start,
        end: oneYear,
      })
    ).toBe(30 * 528);
    expect(
      commitmentAmount({
        minSeats: 30,
        ratePerPeriod: 44,
        isAnnual: false,
        start,
        end: oneYear,
      })
    ).toBeCloseTo(30 * 44 * 12, 6);
  });

  it("scales linearly with the seat count", () => {
    const one = commitmentAmount({
      minSeats: 1,
      ratePerPeriod: 240,
      isAnnual: true,
      start: contractStart,
      end: contractEnd,
    });
    const thirty = commitmentAmount({
      minSeats: 30,
      ratePerPeriod: 240,
      isAnnual: true,
      start: contractStart,
      end: contractEnd,
    });
    expect(thirty).toBeCloseTo(one * 30, 6);
  });
});

describe("commitmentAccessTranches", () => {
  const contractStart = new Date(Date.UTC(2026, 8, 7, 21));
  const contractEnd = new Date(Date.UTC(2026, 9, 19, 21));

  it("returns one tranche per month for a monthly seat, on each anniversary", () => {
    const tranches = commitmentAccessTranches({
      minSeats: 30,
      ratePerPeriod: 44,
      isAnnual: false,
      start,
      end: oneYear,
    });
    expect(tranches).toHaveLength(12);
    // Each whole month unlocks a full month's worth, on the month anniversary.
    tranches.forEach((tranche, k) => {
      expect(tranche.amountCurrencyUnits).toBeCloseTo(30 * 44, 6);
      expect(tranche.startingAt).toEqual(new Date(Date.UTC(2026, k, 1)));
      expect(tranche.endingBefore).toEqual(new Date(Date.UTC(2026, k + 1, 1)));
    });
  });

  it("returns a single tranche for a yearly seat over one year", () => {
    const tranches = commitmentAccessTranches({
      minSeats: 30,
      ratePerPeriod: 528,
      isAnnual: true,
      start,
      end: oneYear,
    });
    expect(tranches).toHaveLength(1);
    expect(tranches[0].amountCurrencyUnits).toBe(30 * 528);
    expect(tranches[0].startingAt).toEqual(start);
    expect(tranches[0].endingBefore).toEqual(oneYear);
  });

  it("prorates the partial trailing month and clamps its end to the commitment", () => {
    // Sep 7 → Oct 19: a full first month + 12/31 of October.
    const tranches = commitmentAccessTranches({
      minSeats: 1,
      ratePerPeriod: 20,
      isAnnual: false,
      start: contractStart,
      end: contractEnd,
    });
    expect(tranches).toHaveLength(2);
    expect(tranches[0].amountCurrencyUnits).toBeCloseTo(20, 6);
    expect(tranches[1].amountCurrencyUnits).toBeCloseTo(20 * (12 / 31), 6);
    expect(tranches[1].endingBefore).toEqual(contractEnd);
  });

  it("aligns first-of-month tranches to the 1st with a prorated leading stub", () => {
    // Sep 7 → Dec 1, billed on the 1st.
    const monthStart = new Date(Date.UTC(2026, 8, 7));
    const tranches = commitmentAccessTranches({
      minSeats: 1,
      ratePerPeriod: 30,
      isAnnual: false,
      start: monthStart,
      end: new Date(Date.UTC(2026, 11, 1)),
      billingAnchor: "first_billing_period",
    });
    expect(tranches).toHaveLength(3);
    // Stub: Sep 7 → Oct 1, prorated over September's 30 days (24 remain).
    expect(tranches[0].startingAt).toEqual(monthStart);
    expect(tranches[0].endingBefore).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(tranches[0].amountCurrencyUnits).toBeCloseTo(30 * (24 / 30), 6);
    // Full calendar months on 1st → 1st boundaries.
    expect(tranches[1].startingAt).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(tranches[1].endingBefore).toEqual(new Date(Date.UTC(2026, 10, 1)));
    expect(tranches[1].amountCurrencyUnits).toBeCloseTo(30, 6);
    expect(tranches[2].startingAt).toEqual(new Date(Date.UTC(2026, 10, 1)));
    expect(tranches[2].endingBefore).toEqual(new Date(Date.UTC(2026, 11, 1)));
    expect(tranches[2].amountCurrencyUnits).toBeCloseTo(30, 6);
  });

  it("sums to commitmentAmount for the same inputs", () => {
    const args = {
      minSeats: 7,
      ratePerPeriod: 20,
      isAnnual: false,
      start: contractStart,
      end: contractEnd,
    };
    const sumCurrencyUnits = commitmentAccessTranches(args).reduce(
      (totalCurrencyUnits, tranche) =>
        totalCurrencyUnits + tranche.amountCurrencyUnits,
      0
    );
    expect(sumCurrencyUnits).toBeCloseTo(commitmentAmount(args), 6);
  });
});
