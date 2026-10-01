import {
  formatCalendarDate,
  formatCalendarDateTime,
} from "@app/lib/client/calendar_date";
import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import type { SupportedLocale } from "@app/types/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Built from local date components so assertions hold whatever the runner's timezone.
const NOW = new Date(2026, 8, 10, 15, 0, 0); // Thu 2026-09-10 15:00 local

async function activateUiLocale(locale: SupportedLocale) {
  i18n.loadAndActivate({ locale, messages: await loadCatalog(locale) });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  await activateUiLocale("en-US");
});

afterEach(() => {
  setFormatLocale(undefined);
  vi.useRealTimers();
});

describe("formatCalendarDate", () => {
  it("labels a time today as 'Today'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 10, 9, 30, 0))).toBe("Today");
  });

  it("labels a time tomorrow as 'Tomorrow'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 11, 9, 30, 0))).toBe(
      "Tomorrow"
    );
  });

  it("labels a time yesterday as 'Yesterday'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 9, 9, 30, 0))).toBe(
      "Yesterday"
    );
  });

  it("labels a time within the last week as 'Last <weekday>'", () => {
    const lastSunday = new Date(2026, 8, 6, 15, 0, 0); // 4 days ago.
    expect(formatCalendarDate(lastSunday)).toBe("Last Sunday");
    const sevenDaysAgo = new Date(2026, 8, 3, 15, 0, 0);
    expect(formatCalendarDate(sevenDaysAgo)).toBe("Last Thursday");
  });

  it("labels a time within the next week as the plain weekday", () => {
    const inSixDays = new Date(2026, 8, 16, 15, 0, 0);
    expect(formatCalendarDate(inSixDays)).toBe("Wednesday");
    const inSevenDays = new Date(2026, 8, 17, 15, 0, 0);
    expect(formatCalendarDate(inSevenDays)).toBe("Thursday");
  });

  it("falls back to a plain date beyond a week in either direction", () => {
    const eightDaysAgo = new Date(2026, 8, 2, 15, 0, 0);
    expect(formatCalendarDate(eightDaysAgo)).toBe("09/02/2026");
    const eightDaysAhead = new Date(2026, 8, 18, 15, 0, 0);
    expect(formatCalendarDate(eightDaysAhead)).toBe("09/18/2026");
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatCalendarDate(Number.NaN)).toBe("Invalid date");
    expect(formatCalendarDate(new Date(Number.NaN))).toBe("Invalid date");
  });
});

describe("formatCalendarDateTime", () => {
  it("labels a time today as 'Today at ...'", () => {
    const today = new Date(2026, 8, 10, 9, 30, 0);
    expect(formatCalendarDateTime(today)).toBe("Today at 9:30:00 AM");
  });

  it("labels a time yesterday as 'Yesterday at ...'", () => {
    const yesterday = new Date(2026, 8, 9, 9, 30, 0);
    expect(formatCalendarDateTime(yesterday)).toBe("Yesterday at 9:30:00 AM");
  });

  it("labels a time within the last week as 'Last <weekday> at ...'", () => {
    const lastSunday = new Date(2026, 8, 6, 9, 30, 0); // 2026-09-06 is a Sunday
    expect(formatCalendarDateTime(lastSunday)).toBe(
      "Last Sunday at 9:30:00 AM"
    );
    const sixDaysAgo = new Date(2026, 8, 4, 23, 59, 59);
    expect(formatCalendarDateTime(sixDaysAgo)).toBe(
      "Last Friday at 11:59:59 PM"
    );
  });

  it("falls back to a plain date from seven days ago", () => {
    const sevenDaysAgo = new Date(2026, 8, 3, 23, 59, 59);
    expect(formatCalendarDateTime(sevenDaysAgo)).toBe("09/03/2026");
    const twoWeeksAgo = new Date(2026, 7, 27, 9, 30, 0);
    expect(formatCalendarDateTime(twoWeeksAgo)).toBe("08/27/2026");
  });

  it("keeps moment's default future formats, which omit seconds", () => {
    expect(formatCalendarDateTime(new Date(2026, 8, 11, 0, 0, 30))).toBe(
      "Tomorrow at 12:00 AM"
    );
    expect(formatCalendarDateTime(new Date(2026, 8, 12, 9, 30, 15))).toBe(
      "Saturday at 9:30 AM"
    );
    expect(formatCalendarDateTime(new Date(2026, 8, 16, 9, 30, 0))).toBe(
      "Wednesday at 9:30 AM"
    );
    expect(formatCalendarDateTime(new Date(2026, 8, 17, 9, 30, 0))).toBe(
      "09/17/2026"
    );
  });

  it("uses the same reference instant for every comparison", () => {
    const now = new Date(2026, 8, 10, 0, 0, 0);
    expect(formatCalendarDateTime(new Date(2026, 8, 9, 23, 59, 59), now)).toBe(
      "Yesterday at 11:59:59 PM"
    );
  });

  it("labels the first hour of yesterday as 'Yesterday'", () => {
    const now = new Date(2026, 8, 6, 1, 0, 0);
    expect(formatCalendarDateTime(new Date(2026, 8, 5, 0, 30, 0), now)).toBe(
      "Yesterday at 12:30:00 AM"
    );
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatCalendarDateTime(Number.NaN)).toBe("Invalid date");
  });
});

describe("UI locale", () => {
  it.each([
    [
      "en-GB",
      ["Today", "Yesterday", "Last Sunday", "02/09/2026"],
      ["Today at 09:30:00", "Last Sunday at 09:30:00", "Tomorrow at 00:00"],
    ],
    [
      "fr-FR",
      ["Aujourd’hui", "Hier", "Last dimanche", "02/09/2026"],
      [
        "Aujourd’hui at 09:30:00",
        "Last dimanche at 09:30:00",
        "Demain at 00:00",
      ],
    ],
  ] as const)("formats in %s once active", async (locale, dates, dateTimes) => {
    await activateUiLocale(locale);
    expect([
      formatCalendarDate(new Date(2026, 8, 10, 9, 30, 0)),
      formatCalendarDate(new Date(2026, 8, 9, 9, 30, 0)),
      formatCalendarDate(new Date(2026, 8, 6, 15, 0, 0)),
      formatCalendarDate(new Date(2026, 8, 2, 15, 0, 0)),
    ]).toEqual(dates);
    expect([
      formatCalendarDateTime(new Date(2026, 8, 10, 9, 30, 0)),
      formatCalendarDateTime(new Date(2026, 8, 6, 9, 30, 0)),
      formatCalendarDateTime(new Date(2026, 8, 11, 0, 0, 30)),
    ]).toEqual(dateTimes);
  });

  it("ignores the format locale", () => {
    setFormatLocale("fr-FR");
    expect(formatCalendarDate(new Date(2026, 8, 9, 9, 30, 0))).toBe(
      "Yesterday"
    );
    expect(formatCalendarDateTime(new Date(2026, 8, 6, 9, 30, 0))).toBe(
      "Last Sunday at 9:30:00 AM"
    );
  });
});
