import { getPastedFileName } from "@app/components/assistant/conversation/input_bar/pasted_utils";
import { formatAmount } from "@app/components/workspace/billing/seatTypeUtils";
import { formatPostSummary } from "@app/lib/api/actions/servers/slab/helpers";
import type { SlabPost } from "@app/lib/api/actions/servers/slab/types";
import { formatTimestampToFriendlyDate } from "@app/lib/client/friendly_date";
import { describeWakeUpSchedule } from "@app/lib/client/wakeup_schedule";
import {
  compareStrings,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatList,
  formatNumber,
  formatRelativeTime,
  formatTime,
  formatTimeDistance,
  getLocalTimeZone,
  normalizeDecimalSeparator,
  NUMERIC_DATE_TIME_OPTIONS,
  prefersTwentyFourHourTime,
  setFormatLocale,
} from "@app/lib/i18n/format";
import { i18n } from "@app/lib/i18n/i18n";
import {
  formatCurrencyAmount,
  formatCurrencyAmountCents,
} from "@app/lib/metronome/amounts";
import { getPriceAsString } from "@app/lib/plans/pricing";
import {
  formatDate as formatDatePattern,
  formatDurationString,
  formatShortDate,
  formatTimestring,
} from "@app/lib/utils/timestamps";
import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import type { SupportedLocale } from "@app/types/locale";
import { SUPPORTED_LOCALES } from "@app/types/locale";
import { formatDateFromMillis } from "@app/types/shared/utils/date_utils";
import { format, intlFormatDistance } from "date-fns";
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

const SORTABLE_STRINGS = [
  "zèbre",
  "Éclair",
  "eclair",
  "Alpha",
  "alpha",
  "10",
  "9",
  "_x",
];

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
});

describe.each(SUPPORTED_LOCALES)("with %s as the format locale", (locale) => {
  describe("legacy helpers keep their output", () => {
    it.each([
      ["long", "September 23, 2025 at 3:37:32 PM"],
      ["short", "September 23, 2025"],
      ["compact", "Sep 2025"],
      ["compactWithDay", "Sep 23, 2025"],
    ] as const)("formatTimestampToFriendlyDate %s", (version, expected) => {
      setFormatLocale(locale);
      expect(formatTimestampToFriendlyDate(TIMESTAMP, version)).toBe(expected);
    });

    it.each([
      ["yyyy-MM-dd", "2025-09-23"],
      ["dd-MM-yyyy", "23-09-2025"],
      ["MMM d, yyyy h:mm a", "Sep 23, 2025 3:37 PM"],
      ["EEEE", "Tuesday"],
      ["yyyy-MM-dd HH:mm", "2025-09-23 15:37"],
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
    ])(
      "formatFileSize pinned to en-US for %i bytes with %i decimals",
      (bytes, decimals, expected) => {
        setFormatLocale(locale);
        expect(formatFileSize(bytes, { decimals }, "en-US")).toBe(expected);
      }
    );

    it("getPastedFileName", () => {
      setFormatLocale(locale);
      vi.useFakeTimers();
      vi.setSystemTime(TIMESTAMP);
      expect(getPastedFileName(7)).toBe(
        "pasted-text-7_2025-09-23_15-37-32.txt"
      );
    });
  });

  describe("currency helpers follow the format locale", () => {
    const EXPECTED: Record<
      SupportedLocale,
      { usd: string; eur: string; gbp: string; seatGbp: string }
    > = {
      "en-US": {
        usd: "$1,234.57",
        eur: "€1,234.50",
        gbp: "£0.01",
        seatGbp: "£0.05",
      },
      "en-GB": {
        usd: "US$1,234.57",
        eur: "€1,234.50",
        gbp: "£0.01",
        seatGbp: "£0.05",
      },
      "fr-FR": {
        usd: "1\u202f234,57\u00a0$US",
        eur: "1\u202f234,50\u00a0€",
        gbp: "0,01\u00a0£GB",
        seatGbp: "0,05\u00a0£GB",
      },
    };

    it.each([
      [1234.567, "usd"],
      [1234.5, "eur"],
      [0.0087, "gbp"],
    ] as const)(
      "formatCurrencyAmount %d %s",
      (amountCurrencyUnits, currency) => {
        setFormatLocale(locale);
        expect(
          formatCurrencyAmount({ amount: amountCurrencyUnits, currency })
        ).toBe(EXPECTED[locale][currency]);
        expect(
          formatCurrencyAmountCents({
            amountCents: amountCurrencyUnits * 100,
            currency,
          })
        ).toBe(EXPECTED[locale][currency]);
      }
    );

    it("seat formatAmount", () => {
      setFormatLocale(locale);
      expect(formatAmount(123457, "usd")).toBe(EXPECTED[locale].usd);
      expect(formatAmount(123457, "USD")).toBe(EXPECTED[locale].usd);
      expect(formatAmount(123450, "eur")).toBe(EXPECTED[locale].eur);
      expect(formatAmount(5, "gbp")).toBe(EXPECTED[locale].seatGbp);
    });

    it("getPriceAsString", () => {
      setFormatLocale(locale);
      expect(getPriceAsString({ currency: "usd", priceInCents: 123457 })).toBe(
        EXPECTED[locale].usd
      );
      expect(getPriceAsString({ currency: "eur", priceInCents: 123450 })).toBe(
        EXPECTED[locale].eur
      );
      expect(getPriceAsString({ currency: "gbp", priceInCents: 5 })).toBe(
        EXPECTED[locale].seatGbp
      );
      expect(
        getPriceAsString({ currency: "usd", priceInMicroUsd: 1_234_570_000 })
      ).toBe(EXPECTED[locale].usd);
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
    const dateTimeOptions: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
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
      expect(formatDateTime(date, dateTimeOptions)).toBe(
        date.toLocaleString(locale, dateTimeOptions)
      );
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

    it("formatList", () => {
      setFormatLocale(locale);
      const options: Intl.ListFormatOptions = { type: "unit", style: "narrow" };
      expect(formatList(["2m", "5s"], options)).toBe(
        new Intl.ListFormat(locale, options).format(["2m", "5s"])
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

    it("compareStrings", () => {
      setFormatLocale(locale);
      expect(SORTABLE_STRINGS.toSorted((a, b) => compareStrings(a, b))).toEqual(
        SORTABLE_STRINGS.toSorted((a, b) => a.localeCompare(b, locale))
      );
      expect(compareStrings("a", "A", { sensitivity: "base" })).toBe(
        "a".localeCompare("A", locale, { sensitivity: "base" })
      );
    });

    it("formatTimeDistance", () => {
      setFormatLocale(locale);
      expect(formatTimeDistance(TIMESTAMP - 3 * DAY_MS, TIMESTAMP)).toBe(
        intlFormatDistance(TIMESTAMP - 3 * DAY_MS, TIMESTAMP, { locale })
      );
    });
  });
});

describe("date library calls keep their en-US output", () => {
  it("formatDateTime with NUMERIC_DATE_TIME_OPTIONS matches date-fns Pp", () => {
    setFormatLocale("en-US");
    expect(formatDateTime(TIMESTAMP, NUMERIC_DATE_TIME_OPTIONS)).toBe(
      format(TIMESTAMP, "Pp")
    );
    expect(formatDateTime(TIMESTAMP, NUMERIC_DATE_TIME_OPTIONS)).toBe(
      "09/23/2025, 3:37 PM"
    );
  });

  it.each([1000, 9999])(
    "formatDateTime with NUMERIC_DATE_TIME_OPTIONS matches date-fns Pp in year %i",
    (year) => {
      setFormatLocale("en-US");
      const date = new Date(TIMESTAMP);
      date.setUTCFullYear(year);
      expect(formatDateTime(date, NUMERIC_DATE_TIME_OPTIONS)).toBe(
        format(date, "Pp")
      );
    }
  );

  it.each([
    [-30 * SECOND_MS, "long"],
    [-5 * MINUTE_MS, "long"],
    [-3 * HOUR_MS, "long"],
    [-DAY_MS, "long"],
    [-3 * DAY_MS, "narrow"],
    [-40 * DAY_MS, "long"],
    [-400 * DAY_MS, "narrow"],
    [2 * HOUR_MS, "long"],
  ] as const)(
    "formatTimeDistance %i ms from now in %s style matches intlFormatDistance",
    (offsetMs, style) => {
      setFormatLocale("en-US");
      expect(
        formatTimeDistance(TIMESTAMP + offsetMs, TIMESTAMP, { style })
      ).toBe(
        intlFormatDistance(TIMESTAMP + offsetMs, TIMESTAMP, {
          style,
          locale: "en-US",
        })
      );
    }
  );

  it("formatTimeDistance keeps intlFormatDistance's wording", () => {
    setFormatLocale("en-US");
    expect(formatTimeDistance(TIMESTAMP - DAY_MS, TIMESTAMP)).toBe("yesterday");
    expect(formatTimeDistance(TIMESTAMP - 3 * HOUR_MS, TIMESTAMP)).toBe(
      "3 hours ago"
    );
  });

  it.each([
    [9 * MINUTE_MS + 12 * SECOND_MS, "9 min 12 sec"],
    [9 * MINUTE_MS, "9 min"],
    [45 * SECOND_MS, "45 sec"],
    [500, "< 1 sec"],
  ])("formatDurationString keeps its wording for %i ms", (ms, expected) => {
    setFormatLocale("en-US");
    expect(formatDurationString(ms)).toBe(expected);
  });
});

describe.each([undefined, ...SUPPORTED_LOCALES])(
  "helpers formatting in the format locale, set to %s",
  (locale) => {
    const date = new Date(TIMESTAMP);
    const hourAndMinute: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
    };

    it("formatTimestring", () => {
      setFormatLocale(locale);
      expect(formatTimestring(TIMESTAMP)).toBe(
        date.toLocaleTimeString(locale, hourAndMinute)
      );
    });

    it("formatShortDate", () => {
      setFormatLocale(locale);
      expect(formatShortDate(TIMESTAMP)).toBe(
        date.toLocaleDateString(locale, { month: "short", day: "numeric" })
      );
    });

    it("describeWakeUpSchedule", () => {
      setFormatLocale(locale);
      expect(
        describeWakeUpSchedule(
          {
            scheduleConfig: { type: "one_shot", fireAt: TIMESTAMP },
          },
          (descriptor) => i18n._(descriptor)
        )
      ).toBe(`at ${date.toLocaleTimeString(locale, hourAndMinute)}`);
    });

    it("getConversationDisplayTitle", () => {
      setFormatLocale(locale);
      expect(
        getConversationDisplayTitle(
          { title: null, created: TIMESTAMP },
          new Date(TIMESTAMP + 2 * DAY_MS)
        )
      ).toBe(`Conversation from ${date.toLocaleDateString(locale)}`);
    });

    it("formatPostSummary", () => {
      setFormatLocale(locale);
      const post: SlabPost = {
        id: "post_1",
        title: "Post",
        content: "Content",
        insertedAt: date.toISOString(),
        updatedAt: date.toISOString(),
        publishedAt: null,
        archivedAt: null,
        linkAccess: "internal",
        version: 1,
        owner: { id: "user_1", name: "User", email: "user@example.com" },
        topics: [],
      };
      const summary = formatPostSummary(post);
      expect(summary).toContain(`Created: ${date.toLocaleDateString(locale)}`);
      expect(summary).toContain(`Updated: ${date.toLocaleDateString(locale)}`);
    });
  }
);

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
    ["fr-FR", "1\u202f234,50\u00a0€", "1,5 Ko", true],
  ] as const)(
    "formats money, sizes and hour cycle in %s once set",
    (locale, currency, fileSize, twentyFourHour) => {
      setFormatLocale(locale);
      expect(formatCurrency(1234.5, "EUR")).toBe(currency);
      expect(formatFileSize(1536)).toBe(fileSize);
      expect(prefersTwentyFourHourTime()).toBe(twentyFourHour);
    }
  );

  it.each([
    ["en-US", ["0 B", "1.5 KB", "5.00 MB", "3.00 GB"]],
    ["en-GB", ["0 B", "1.5 KB", "5.00 MB", "3.00 GB"]],
    ["fr-FR", ["0 o", "1,5 Ko", "5,00 Mo", "3,00 Go"]],
  ] as const)("formats file size units in %s once set", (locale, expected) => {
    setFormatLocale(locale);
    expect(
      [0, 1536, 5244114, 3221225472].map((bytes) => formatFileSize(bytes))
    ).toEqual(expected);
  });

  it.each([
    ["en-US", "09/23/2025, 3:37 PM", "yesterday"],
    ["fr-FR", "23/09/2025 15:37", "hier"],
  ] as const)(
    "formats date times and distances in %s once set",
    (locale, dateTime, distance) => {
      setFormatLocale(locale);
      expect(formatDateTime(TIMESTAMP, NUMERIC_DATE_TIME_OPTIONS)).toBe(
        dateTime
      );
      expect(formatTimeDistance(TIMESTAMP - DAY_MS, TIMESTAMP)).toBe(distance);
    }
  );

  it.each([
    ["en-US", ["12.50", "12,50", "1,000.5"]],
    ["en-GB", ["12.50", "12,50", "1,000.5"]],
    ["fr-FR", ["12.50", "12.50", "1.000.5"]],
  ] as const)(
    "normalizes the decimal separator in %s once set",
    (locale, expected) => {
      setFormatLocale(locale);
      expect(
        ["12.50", "12,50", "1,000.5"].map((value) =>
          normalizeDecimalSeparator(value)
        )
      ).toEqual(expected);
    }
  );

  it("uses the explicit locale over the format locale", () => {
    setFormatLocale("fr-FR");
    expect(formatNumber(1234.5, undefined, "en-US")).toBe("1,234.5");
  });

  it("uses the runtime locale when none is set", () => {
    const date = new Date(TIMESTAMP);
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    expect(formatDate(date)).toBe(date.toLocaleDateString());
    expect(formatDate(date, options)).toBe(
      date.toLocaleDateString(undefined, options)
    );
    expect(formatTime(date)).toBe(date.toLocaleTimeString());
    expect(formatTime(date, options)).toBe(
      date.toLocaleTimeString(undefined, options)
    );
    expect(formatDateTime(date)).toBe(date.toLocaleString());
    expect(formatDateTime(date, options)).toBe(
      date.toLocaleString(undefined, options)
    );
    expect(formatNumber(1234.5)).toBe((1234.5).toLocaleString());
    expect(SORTABLE_STRINGS.toSorted((a, b) => compareStrings(a, b))).toEqual(
      SORTABLE_STRINGS.toSorted((a, b) => a.localeCompare(b))
    );
    expect(formatTimeDistance(TIMESTAMP - DAY_MS, TIMESTAMP)).toBe(
      intlFormatDistance(TIMESTAMP - DAY_MS, TIMESTAMP)
    );
  });
});
