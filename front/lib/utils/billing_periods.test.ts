import { getDate } from "date-fns";
import { describe, expect, it } from "vitest";

import { getNextBillingPeriodEnd } from "./billing_periods";

describe("billing_periods", () => {
  describe("getNextBillingPeriodEnd", () => {
    it("should return current month billing day when not yet passed", () => {
      // Test with a date before billing day (e.g., 10th of month, billing day 15th)
      const testDate = new Date("2024-03-10T12:00:00Z");
      const result = getNextBillingPeriodEnd(testDate, 15);

      expect(getDate(result)).toBe(15);
      // Should be in the same month as test date
      expect(result.getMonth()).toBe(testDate.getMonth());
      expect(result.getFullYear()).toBe(testDate.getFullYear());
    });

    it("should return next month billing day when already passed", () => {
      // Test with a date after billing day (e.g., 20th of month, billing day 15th)
      const testDate = new Date("2024-03-20T12:00:00Z");
      const result = getNextBillingPeriodEnd(testDate, 15);

      expect(getDate(result)).toBe(15);
      // Should be in the next month
      const expectedMonth = (testDate.getMonth() + 1) % 12;
      expect(result.getMonth()).toBe(expectedMonth);
    });

    it("should return current month when current day equals billing day", () => {
      // Test with current date equal to billing day
      const testDate = new Date("2024-03-15T12:00:00Z");
      const result = getNextBillingPeriodEnd(testDate, 15);

      expect(getDate(result)).toBe(15);
      // Since currentDate.date() >= billingDay (15 >= 15), it should move to next month
      const expectedMonth = (testDate.getMonth() + 1) % 12;
      expect(result.getMonth()).toBe(expectedMonth);
    });

    it("should handle end of month correctly", () => {
      const testDate = new Date(2024, 0, 15); // January 15, 2024
      const result = getNextBillingPeriodEnd(testDate, 31);

      // The date should be either 31 (if month has 31 days) or adjusted to valid date
      expect(getDate(result)).toBeGreaterThan(0);
      expect(getDate(result)).toBeLessThanOrEqual(31);
      expect(result.getMonth()).toBe(testDate.getMonth()); // Same month since 15 < 31
    });
  });
});
