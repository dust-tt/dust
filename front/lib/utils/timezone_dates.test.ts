import { describe, expect, it } from "vitest";

import { formatDateInTimezone } from "./timezone_dates";

describe("timezone_dates", () => {
  describe("formatDateInTimezone", () => {
    it("should return date in correct format for UTC", () => {
      const testDate = new Date("2024-03-15T10:30:00Z");
      const result = formatDateInTimezone(testDate, "UTC");

      // Should match the pattern MM/DD/YYYY (ddd)
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);
    });

    it("should return date in correct format for various timezones", () => {
      const timezones = [
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
        "Asia/Tokyo",
        "Australia/Sydney",
      ];

      timezones.forEach((timezone) => {
        const testDate = new Date("2024-03-15T10:30:00Z");
        const result = formatDateInTimezone(testDate, timezone);

        // Should always return a string in the expected format
        expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);

        // Should be a valid date string
        const dateStr = result.split(" ")[0];
        const parsedDate = new Date(dateStr);
        expect(parsedDate).toBeInstanceOf(Date);
        expect(parsedDate.getTime()).not.toBeNaN();
      });
    });

    it("should return consistent format across calls", () => {
      const testDate = new Date("2024-03-15T10:30:00Z");
      const result1 = formatDateInTimezone(testDate, "UTC");
      const result2 = formatDateInTimezone(testDate, "UTC");

      // Both should have the same format
      expect(result1).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);
      expect(result2).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);

      // Since these are called very close together, they should be the same
      expect(result1).toBe(result2);
    });

    it("should produce correct format with expected components", () => {
      const testDate = new Date("2024-03-15T10:30:00Z");
      const timezone = "America/New_York";
      const result = formatDateInTimezone(testDate, timezone);

      // Should match the expected format
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);

      // Extract parts to verify they're reasonable
      const [datePart, weekdayPart] = result.split(" ");
      const date = new Date(datePart);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).not.toBeNaN();

      // Weekday should be valid
      const validWeekdays = [
        "(Mon)",
        "(Tue)",
        "(Wed)",
        "(Thu)",
        "(Fri)",
        "(Sat)",
        "(Sun)",
      ];
      expect(validWeekdays).toContain(weekdayPart);
    });

    it("should handle different timezones that may show different dates", () => {
      // Get results from timezones that are far apart
      const testDate = new Date("2024-03-15T10:30:00Z");
      const utcResult = formatCurrentDateInTimezone(testDate, "UTC");
      const tokyoResult = formatCurrentDateInTimezone(testDate, "Asia/Tokyo");
      const laResult = formatCurrentDateInTimezone(
        testDate,
        "America/Los_Angeles"
      );

      // All should be valid format
      expect(utcResult).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);
      expect(tokyoResult).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);
      expect(laResult).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);

      // Depending on the time, some might show different dates
      const dates = [utcResult, tokyoResult, laResult];
      dates.forEach((dateStr) => {
        const dateOnly = dateStr.split(" ")[0];
        expect(dateOnly).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      });
    });

    it("should handle invalid timezone gracefully", () => {
      // Should handle invalid timezones without throwing
      expect(() => {
        const testDate = new Date("2024-03-15T10:30:00Z");
        const result = formatCurrentDateInTimezone(
          testDate,
          "Invalid/Timezone"
        );
        expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \([A-Za-z]{3}\)$/);
      }).not.toThrow();
    });

    it("should include correct weekday abbreviations", () => {
      const testDate = new Date("2024-03-15T10:30:00Z"); // This is a Friday
      const result = formatDateInTimezone(testDate, "UTC");
      const weekdayPart = result.match(/\(([A-Za-z]{3})\)$/);

      expect(weekdayPart).not.toBeNull();

      // Should be a valid 3-letter weekday abbreviation
      const validWeekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      expect(validWeekdays).toContain(weekdayPart![1]);
    });
  });
});
