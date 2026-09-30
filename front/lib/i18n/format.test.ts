import { formatAmount } from "@app/components/workspace/billing/seatTypeUtils";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatNumber,
  formatRelativeTime,
  formatTime,
  getLocalTimeZone,
  prefersTwentyFourHourTime,
  setFormatLocale,
} from "@app/lib/i18n/format";
import {
  formatCurrencyAmount,
  formatCurrencyAmountCents,
} from "@app/lib/metronome/amounts";
import { formatTimestampToFriendlyDate, timeAgoFrom } from "@app/lib/utils";
import { formatDate as formatDatePattern } from "@app/lib/utils/timestamps";
import type { SupportedLocale } from "@app/types/locale";
import { SUPPORTED_LOCALES } from "@app/types/locale";
import { formatDateFromMillis } from "@app/types/shared/utils/date_utils";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Tue 2025-09-23 15:37:32 UTC.
const TIMESTAMP = Date.UTC(2025, 8, 23, 15, 37, 32);

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  setFormatLocale(undefined);
  vi.useRealTimers();
});

describe.each(SUPPORTED_LOCALES)("with %s as the format locale", (locale) => {
  describe("legacy helpers keep their output", () => {
    it.each([
      ["long", "September 23, 2025 at 3:37:32 PM"],
      ["short", "September 23, 2025"],
      ["compact", "Sep, 2025"],
      ["compactWithDay", "Sep 23, 2025"],
    ] as const)("formatTimestampToFriendlyDate %s", (version, expected) => {
      setFormatLocale(locale);
      expect(formatTimestampToFriendlyDate(TIMESTAMP, version)).toBe(expected);
    });

    it.each([
      [30 * SECOND_MS, "<1m", "<1m"],
      [MINUTE_MS, "1min", "1 minute"],
      [5 * MINUTE_MS, "5min", "5 minutes"],
      [HOUR_MS, "1h", "1 hour"],
      [3 * HOUR_MS, "3h", "3 hours"],
      [DAY_MS, "1d", "1 day"],
      [3 * DAY_MS, "3d", "3 days"],
      [31 * DAY_MS, "1m", "1 month"],
      [62 * DAY_MS, "2m", "2 months"],
      [366 * DAY_MS, "1y", "1 year"],
      [800 * DAY_MS, "2y", "2 years"],
    ])("timeAgoFrom %i ms ago", (elapsedMs, short, long) => {
      setFormatLocale(locale);
      vi.useFakeTimers();
      vi.setSystemTime(TIMESTAMP);
      expect(timeAgoFrom(TIMESTAMP - elapsedMs)).toBe(short);
      expect(timeAgoFrom(TIMESTAMP - elapsedMs, { useLongFormat: true })).toBe(
        long
      );
    });

    it.each([
      ["yyyy-MM-dd", "2025-09-23"],
      ["dd-MM-yyyy", "23-09-2025"],
      ["MMM d, yyyy h:mm a", "Sep 23, 2025 3:37 PM"],
      ["EEEE", "Tuesday"],
    ])("formatDate from timestamps with %s", (pattern, expected) => {
      setFormatLocale(locale);
      expect(formatDatePattern(TIMESTAMP, pattern)).toBe(expected);
    });

    it.each([
      ["UTC", "2025-09-23"],
      ["Asia/Tokyo", "2025-09-24"],
    ])("formatDateFromMillis in %s", (timezone, expected) => {
      setFormatLocale(locale);
      expect(formatDateFromMillis(TIMESTAMP, timezone)).toBe(expected);
    });

    it.each([
      [1234.567, "usd", "$1,234.57"],
      [1234.5, "eur", "€1,234.50"],
      [0.0087, "gbp", "£0.01"],
    ] as const)("formatCurrencyAmount %d %s", (amountCurrencyUnits, currency, expected) => {
      setFormatLocale(locale);
      expect(
        formatCurrencyAmount({ amount: amountCurrencyUnits, currency })
      ).toBe(expected);
      expect(
        formatCurrencyAmountCents({
          amountCents: amountCurrencyUnits * 100,
          currency,
        })
      ).toBe(expected);
    });

    it.each([
      [123456, "usd", "$1,234.56"],
      [123456, "USD", "$1,234.56"],
      [123456, "eur", "1\u202f234,56\u00a0€"],
      [5, "gbp", "0,05\u00a0£GB"],
    ])("seat formatAmount %i %s", (amountCents, currency, expected) => {
      setFormatLocale(locale);
      expect(formatAmount(amountCents, currency)).toBe(expected);
    });

    it.each([
      [0, "0 B"],
      [1023, "1023 B"],
      [1024, "1.0 KB"],
      [1536, "1.5 KB"],
      [1048575, "1024.0 KB"],
      [1048576, "1.00 MB"],
      [5244114, "5.00 MB"],
      [3221225472, "3.00 GB"],
    ])("formatFileSize pinned to en-US for %i bytes", (bytes, expected) => {
      setFormatLocale(locale);
      expect(formatFileSize(bytes, undefined, "en-US")).toBe(expected);
    });

    it.each([
      [512, 0, "512 B"],
      [512, 2, "512.00 B"],
      [1536, 0, "2 KB"],
      [1536, 1, "1.5 KB"],
      [10485760, 0, "10 MB"],
      [5244114, 2, "5.00 MB"],
      [3221225472, 0, "3 GB"],
      [3221225472, 2, "3.00 GB"],
      [5497558138880, 0, "5120 GB"],
    ])("formatFileSize pinned to en-US for %i bytes with %i decimals", (bytes, decimals, expected) => {
      setFormatLocale(locale);
      expect(formatFileSize(bytes, { decimals }, "en-US")).toBe(expected);
    });
  });

  describe("the module matches the native Intl calls", () => {
    const dateOptions: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
    };

    it("formatDate", () => {
      setFormatLocale(locale);
      const date = new Date(TIMESTAMP);
      expect(formatDate(TIMESTAMP)).toBe(date.toLocaleDateString(locale));
      expect(formatDate(date, dateOptions)).toBe(
        date.toLocaleDateString(locale, dateOptions)
      );
    });

    it("formatTime", () => {
      setFormatLocale(locale);
      const date = new Date(TIMESTAMP);
      expect(formatTime(TIMESTAMP)).toBe(date.toLocaleTimeString(locale));
      expect(formatTime(date, timeOptions)).toBe(
        date.toLocaleTimeString(locale, timeOptions)
      );
    });

    it("formatDateTime", () => {
      setFormatLocale(locale);
      const date = new Date(TIMESTAMP);
      expect(formatDateTime(TIMESTAMP)).toBe(date.toLocaleString(locale));
    });

    it("formatNumber", () => {
      setFormatLocale(locale);
      expect(formatNumber(1234567.891)).toBe(
        (1234567.891).toLocaleString(locale)
      );
    });

    it("formatRelativeTime", () => {
      setFormatLocale(locale);
      expect(formatRelativeTime(-3, "day")).toBe(
        new Intl.RelativeTimeFormat(locale).format(-3, "day")
      );
    });

    it("formatCurrency", () => {
      setFormatLocale(locale);
      expect(formatCurrency(1234.5, "EUR")).toBe(
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "EUR",
        }).format(1234.5)
      );
    });

    it("prefersTwentyFourHourTime", () => {
      setFormatLocale(locale);
      const { hourCycle } = new Intl.DateTimeFormat(locale, {
        hour: "numeric",
      }).resolvedOptions();
      expect(prefersTwentyFourHourTime()).toBe(
        hourCycle === "h23" || hourCycle === "h24"
      );
    });

    it("getLocalTimeZone", () => {
      setFormatLocale(locale);
      expect(getLocalTimeZone()).toBe(
        Intl.DateTimeFormat().resolvedOptions().timeZone
      );
    });
  });
});

describe("format locale resolution", () => {
  const cases: [SupportedLocale, string, string, string][] = [
    ["en-US", "September 23, 2025", "1,234.5", "3 days ago"],
    ["fr-FR", "23 septembre 2025", "1 234,5", "il y a 3 jours"],
  ];

  it.each(cases)("formats in %s once set", (locale, date, number, relative) => {
    setFormatLocale(locale);
    expect(
      formatDate(TIMESTAMP, { year: "numeric", month: "long", day: "numeric" })
    ).toBe(date);
    expect(formatNumber(1234.5)).toBe(number);
    expect(formatRelativeTime(-3, "day")).toBe(relative);
  });

  it.each([
    ["en-US", "€1,234.50", "1.5 KB", false],
    ["fr-FR", "1\u202f234,50\u00a0€", "1,5 KB", true],
  ] as const)("formats money, sizes and hour cycle in %s once set", (locale, currency, fileSize, twentyFourHour) => {
    setFormatLocale(locale);
    expect(formatCurrency(1234.5, "EUR")).toBe(currency);
    expect(formatFileSize(1536)).toBe(fileSize);
    expect(prefersTwentyFourHourTime()).toBe(twentyFourHour);
  });

  it("uses the explicit locale over the format locale", () => {
    setFormatLocale("fr-FR");
    expect(formatNumber(1234.5, undefined, "en-US")).toBe("1,234.5");
  });

  it("uses the runtime locale when none is set", () => {
    expect(formatNumber(1234.5)).toBe((1234.5).toLocaleString());
  });
});
