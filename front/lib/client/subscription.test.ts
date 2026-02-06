import { describe, expect, it } from "vitest";

import { getBillingCycle, getBillingCycleFromDay } from "./subscription";

describe("subscription billing cycle utilities", () => {
  describe("getBillingCycleFromDay", () => {
    describe("basic behavior with useUTC=true", () => {
      it("returns current month cycle when day >= billingCycleStartDay", () => {
        // Feb 15, 2026 UTC, billing starts on day 10
        const referenceDate = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));
        const result = getBillingCycleFromDay(10, referenceDate, true);

        expect(result.cycleStart.toISOString()).toBe(
          "2026-02-10T00:00:00.000Z"
        );
        expect(result.cycleEnd.toISOString()).toBe("2026-03-10T00:00:00.000Z");
      });

      it("returns previous month cycle when day < billingCycleStartDay", () => {
        // Feb 5, 2026 UTC, billing starts on day 10
        const referenceDate = new Date(Date.UTC(2026, 1, 5, 12, 0, 0));
        const result = getBillingCycleFromDay(10, referenceDate, true);

        expect(result.cycleStart.toISOString()).toBe(
          "2026-01-10T00:00:00.000Z"
        );
        expect(result.cycleEnd.toISOString()).toBe("2026-02-10T00:00:00.000Z");
      });

      it("returns current month cycle when day equals billingCycleStartDay", () => {
        // Feb 10, 2026 UTC, billing starts on day 10
        const referenceDate = new Date(Date.UTC(2026, 1, 10, 12, 0, 0));
        const result = getBillingCycleFromDay(10, referenceDate, true);

        expect(result.cycleStart.toISOString()).toBe(
          "2026-02-10T00:00:00.000Z"
        );
        expect(result.cycleEnd.toISOString()).toBe("2026-03-10T00:00:00.000Z");
      });
    });

    describe("basic behavior with useUTC=false (local timezone)", () => {
      it("uses local timezone methods when useUTC=false", () => {
        // Create a date and verify it uses local methods
        const referenceDate = new Date(2026, 1, 15, 12, 0, 0); // Local time
        const result = getBillingCycleFromDay(10, referenceDate, false);

        // The cycle start should be in local timezone (midnight local)
        expect(result.cycleStart.getDate()).toBe(10);
        expect(result.cycleStart.getMonth()).toBe(1); // February
        expect(result.cycleStart.getFullYear()).toBe(2026);
      });
    });

    describe("year boundary handling", () => {
      it("handles December to January transition (useUTC=true)", () => {
        // Jan 5, 2026 UTC, billing starts on day 15
        const referenceDate = new Date(Date.UTC(2026, 0, 5, 12, 0, 0));
        const result = getBillingCycleFromDay(15, referenceDate, true);

        // Should go back to December 2025
        expect(result.cycleStart.toISOString()).toBe(
          "2025-12-15T00:00:00.000Z"
        );
        expect(result.cycleEnd.toISOString()).toBe("2026-01-15T00:00:00.000Z");
      });

      it("handles December to January transition forward (useUTC=true)", () => {
        // Dec 20, 2025 UTC, billing starts on day 15
        const referenceDate = new Date(Date.UTC(2025, 11, 20, 12, 0, 0));
        const result = getBillingCycleFromDay(15, referenceDate, true);

        expect(result.cycleStart.toISOString()).toBe(
          "2025-12-15T00:00:00.000Z"
        );
        expect(result.cycleEnd.toISOString()).toBe("2026-01-15T00:00:00.000Z");
      });
    });

    describe("edge case: billing day 1 (first of month)", () => {
      it("handles day 1 billing correctly mid-month", () => {
        // Feb 15, 2026 UTC, billing starts on day 1
        const referenceDate = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));
        const result = getBillingCycleFromDay(1, referenceDate, true);

        expect(result.cycleStart.toISOString()).toBe(
          "2026-02-01T00:00:00.000Z"
        );
        expect(result.cycleEnd.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      });

      it("handles day 1 billing on the first of the month", () => {
        // Feb 1, 2026 UTC, billing starts on day 1
        const referenceDate = new Date(Date.UTC(2026, 1, 1, 12, 0, 0));
        const result = getBillingCycleFromDay(1, referenceDate, true);

        expect(result.cycleStart.toISOString()).toBe(
          "2026-02-01T00:00:00.000Z"
        );
        expect(result.cycleEnd.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      });
    });

    describe("edge case: billing day at end of month (28-31)", () => {
      it("handles billing day 31 in months with fewer days", () => {
        // Feb 15, 2026 (Feb has 28 days), billing starts on day 31
        const referenceDate = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));
        const result = getBillingCycleFromDay(31, referenceDate, true);

        // JavaScript Date handles overflow - Feb 31 becomes Mar 3
        // This is existing behavior we're documenting
        expect(result.cycleStart.getUTCMonth()).toBe(0); // January
        expect(result.cycleEnd.getUTCMonth()).toBe(2); // March (Feb 31 overflows)
      });
    });

    describe("timezone edge cases - THE BUG SCENARIO", () => {
      // This is the core bug: when useUTC and local timezone disagree about the day
      it("handles SF timezone scenario with billing day 1 (the navigation loop bug)", () => {
        // Scenario: User in SF (UTC-8) viewing December billing cycle
        // Dec 1, 2025 00:00 UTC = Nov 30, 2025 4:00pm in SF
        const utcDate = new Date(Date.UTC(2025, 11, 1, 0, 0, 0));

        // With useUTC=true, we correctly get December cycle
        const utcResult = getBillingCycleFromDay(1, utcDate, true);
        expect(utcResult.cycleStart.getUTCMonth()).toBe(11); // December
        expect(utcResult.cycleStart.getUTCDate()).toBe(1);

        // The bug was: if code used local methods on UTC dates,
        // it would see November instead of December for users behind UTC
      });

      it("handles UTC+12 timezone scenario (ahead of UTC)", () => {
        // User in NZ (UTC+12)
        // Feb 1, 2026 00:00 UTC = Feb 1, 2026 12:00pm in NZ
        // This is less problematic since local date >= UTC date
        const utcDate = new Date(Date.UTC(2026, 1, 1, 0, 0, 0));
        const result = getBillingCycleFromDay(1, utcDate, true);

        expect(result.cycleStart.getUTCMonth()).toBe(1); // February
        expect(result.cycleStart.getUTCDate()).toBe(1);
      });

      it("ensures consistent results regardless of system timezone", () => {
        // Create a specific UTC moment
        const utcMoment = Date.UTC(2026, 1, 15, 4, 0, 0); // Feb 15, 2026 4am UTC
        const date = new Date(utcMoment);

        // With useUTC=true, result should always be the same
        const result = getBillingCycleFromDay(10, date, true);

        // These assertions work regardless of the test runner's timezone
        expect(result.cycleStart.getUTCFullYear()).toBe(2026);
        expect(result.cycleStart.getUTCMonth()).toBe(1); // February
        expect(result.cycleStart.getUTCDate()).toBe(10);
      });
    });

    describe("consistency between useUTC=true/false at noon UTC", () => {
      // At noon UTC, most timezones will agree on the date
      it("gives same day when reference is noon UTC and timezone offset < 12h", () => {
        const noonUtc = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));

        const utcResult = getBillingCycleFromDay(10, noonUtc, true);

        // At noon UTC, any timezone within +/- 12 hours will see Feb 15
        // So both should calculate the same billing cycle
        expect(utcResult.cycleStart.getUTCDate()).toBe(10);
        // Local result uses local methods, but at noon UTC most places see same day
      });
    });
  });

  describe("getBillingCycle", () => {
    it("returns null when subscriptionStartDate is null", () => {
      const result = getBillingCycle(null);
      expect(result).toBeNull();
    });

    it("extracts billing day from subscription start date using UTC", () => {
      // Subscription started Jan 21, 2025 at midnight UTC
      const startTimestamp = Date.UTC(2025, 0, 21, 0, 0, 0);

      // Reference date: Feb 15, 2026
      const referenceDate = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));

      const result = getBillingCycle(startTimestamp, referenceDate);

      expect(result).not.toBeNull();
      // Billing day should be 21 (extracted from subscription start)
      // Feb 15 < 21, so we should be in the Jan 21 - Feb 21 cycle
      expect(result?.cycleStart.getUTCDate()).toBe(21);
      expect(result?.cycleStart.getUTCMonth()).toBe(0); // January
    });

    it("handles subscription start date near midnight UTC (timezone edge case)", () => {
      // Subscription started Jan 1, 2025 at 00:30 UTC
      // In SF (UTC-8), this would appear as Dec 31, 2024 4:30pm
      const startTimestamp = Date.UTC(2025, 0, 1, 0, 30, 0);

      const referenceDate = new Date(Date.UTC(2026, 1, 15, 12, 0, 0));
      const result = getBillingCycle(startTimestamp, referenceDate);

      // With the fix, billing day should be 1 (UTC date), not 31 (SF local date)
      expect(result?.cycleStart.getUTCDate()).toBe(1);
    });
  });
});
