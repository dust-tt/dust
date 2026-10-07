import {
  formatCalendarDate,
  formatCalendarDateTime,
  getCalendarDay,
} from "@app/lib/client/calendar_date";
import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import type { SupportedLocale } from "@app/types/locale";
import type { MessageDescriptor } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);

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
    expect(formatCalendarDate(new Date(2026, 8, 10, 9, 30, 0), translate)).toBe(
      "Today"
    );
  });

  it("labels a time tomorrow as 'Tomorrow'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 11, 9, 30, 0), translate)).toBe(
      "Tomorrow"
    );
  });

  it("labels a time yesterday as 'Yesterday'", () => {
    expect(formatCalendarDate(new Date(2026, 8, 9, 9, 30, 0), translate)).toBe(
      "Yesterday"
    );
  });

  it("labels a time within the last week as 'Last <weekday>'", () => {
    const lastSunday = new Date(2026, 8, 6, 15, 0, 0); // 4 days ago.
    expect(formatCalendarDate(lastSunday, translate)).toBe("Last Sunday");
    const sevenDaysAgo = new Date(2026, 8, 3, 15, 0, 0);
    expect(formatCalendarDate(sevenDaysAgo, translate)).toBe("Last Thursday");
  });

  it("labels a time within the next week as the plain weekday", () => {
    const inSixDays = new Date(2026, 8, 16, 15, 0, 0);
    expect(formatCalendarDate(inSixDays, translate)).toBe("Wednesday");
    const inSevenDays = new Date(2026, 8, 17, 15, 0, 0);
    expect(formatCalendarDate(inSevenDays, translate)).toBe("Thursday");
  });

  it("falls back to a plain date beyond a week in either direction", () => {
    const eightDaysAgo = new Date(2026, 8, 2, 15, 0, 0);
    expect(formatCalendarDate(eightDaysAgo, translate)).toBe("09/02/2026");
    const eightDaysAhead = new Date(2026, 8, 18, 15, 0, 0);
    expect(formatCalendarDate(eightDaysAhead, translate)).toBe("09/18/2026");
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatCalendarDate(Number.NaN, translate)).toBe("Invalid date");
    expect(formatCalendarDate(new Date(Number.NaN), translate)).toBe(
      "Invalid date"
    );
  });
});

describe("getCalendarDay", () => {
  it.each([
    [new Date(2026, 8, 9, 9, 30, 0), "relative", "yesterday"],
    [new Date(2026, 8, 6, 15, 0, 0), "lastWeekday", "Sunday"],
    [new Date(2026, 8, 16, 15, 0, 0), "weekday", "Wednesday"],
    [new Date(2026, 8, 2, 15, 0, 0), "date", "09/02/2026"],
  ])("labels %s as %s %s", (date, kind, day) => {
    expect(getCalendarDay(date)).toEqual({ kind, day });
  });

  it("returns null for an invalid date", () => {
    expect(getCalendarDay(Number.NaN)).toBeNull();
  });
});

describe("formatCalendarDateTime", () => {
  it("labels a time today as 'Today at ...'", () => {
    const today = new Date(2026, 8, 10, 9, 30, 0);
    expect(formatCalendarDateTime(today, translate)).toBe(
      "Today at 9:30:00 AM"
    );
  });

  it("labels a time yesterday as 'Yesterday at ...'", () => {
    const yesterday = new Date(2026, 8, 9, 9, 30, 0);
    expect(formatCalendarDateTime(yesterday, translate)).toBe(
      "Yesterday at 9:30:00 AM"
    );
  });

  it("labels a time within the last week as 'Last <weekday> at ...'", () => {
    const lastSunday = new Date(2026, 8, 6, 9, 30, 0); // 2026-09-06 is a Sunday
    expect(formatCalendarDateTime(lastSunday, translate)).toBe(
      "Last Sunday at 9:30:00 AM"
    );
    const sixDaysAgo = new Date(2026, 8, 4, 23, 59, 59);
    expect(formatCalendarDateTime(sixDaysAgo, translate)).toBe(
      "Last Friday at 11:59:59 PM"
    );
  });

  it("falls back to a plain date from seven days ago", () => {
    const sevenDaysAgo = new Date(2026, 8, 3, 23, 59, 59);
    expect(formatCalendarDateTime(sevenDaysAgo, translate)).toBe("09/03/2026");
    const twoWeeksAgo = new Date(2026, 7, 27, 9, 30, 0);
    expect(formatCalendarDateTime(twoWeeksAgo, translate)).toBe("08/27/2026");
  });

  it("keeps moment's default future formats, which omit seconds", () => {
    expect(
      formatCalendarDateTime(new Date(2026, 8, 11, 0, 0, 30), translate)
    ).toBe("Tomorrow at 12:00 AM");
    expect(
      formatCalendarDateTime(new Date(2026, 8, 12, 9, 30, 15), translate)
    ).toBe("Saturday at 9:30 AM");
    expect(
      formatCalendarDateTime(new Date(2026, 8, 16, 9, 30, 0), translate)
    ).toBe("Wednesday at 9:30 AM");
    expect(
      formatCalendarDateTime(new Date(2026, 8, 17, 9, 30, 0), translate)
    ).toBe("09/17/2026");
  });

  it("uses the same reference instant for every comparison", () => {
    const now = new Date(2026, 8, 10, 0, 0, 0);
    expect(
      formatCalendarDateTime(new Date(2026, 8, 9, 23, 59, 59), translate, now)
    ).toBe("Yesterday at 11:59:59 PM");
  });

  it("labels the first hour of yesterday as 'Yesterday'", () => {
    const now = new Date(2026, 8, 6, 1, 0, 0);
    expect(
      formatCalendarDateTime(new Date(2026, 8, 5, 0, 30, 0), translate, now)
    ).toBe("Yesterday at 12:30:00 AM");
  });

  it("renders an invalid date like moment instead of throwing", () => {
    expect(formatCalendarDateTime(Number.NaN, translate)).toBe("Invalid date");
  });

  it("translates the invalid date label", async () => {
    await activateUiLocale("fr-FR");
    expect(formatCalendarDateTime(Number.NaN, translate)).toBe(
      "Date non valide"
    );
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
      ["Aujourd’hui", "Hier", "dimanche dernier", "02/09/2026"],
      [
        "Aujourd’hui à 09:30:00",
        "dimanche dernier à 09:30:00",
        "Demain à 00:00",
      ],
    ],
  ] as const)("formats in %s once active", async (locale, dates, dateTimes) => {
    await activateUiLocale(locale);
    expect([
      formatCalendarDate(new Date(2026, 8, 10, 9, 30, 0), translate),
      formatCalendarDate(new Date(2026, 8, 9, 9, 30, 0), translate),
      formatCalendarDate(new Date(2026, 8, 6, 15, 0, 0), translate),
      formatCalendarDate(new Date(2026, 8, 2, 15, 0, 0), translate),
    ]).toEqual(dates);
    expect([
      formatCalendarDateTime(new Date(2026, 8, 10, 9, 30, 0), translate),
      formatCalendarDateTime(new Date(2026, 8, 6, 9, 30, 0), translate),
      formatCalendarDateTime(new Date(2026, 8, 11, 0, 0, 30), translate),
    ]).toEqual(dateTimes);
  });

  it("ignores the format locale", () => {
    setFormatLocale("fr-FR");
    expect(formatCalendarDate(new Date(2026, 8, 9, 9, 30, 0), translate)).toBe(
      "Yesterday"
    );
    expect(
      formatCalendarDateTime(new Date(2026, 8, 6, 9, 30, 0), translate)
    ).toBe("Last Sunday at 9:30:00 AM");
  });
});
