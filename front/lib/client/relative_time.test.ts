import { formatRelativeTime, timeAgoFrom } from "@app/lib/client/relative_time";
import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import type { SupportedLocale } from "@app/types/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tue 2025-09-23 15:37:32 UTC.
const NOW = new Date(Date.UTC(2025, 8, 23, 15, 37, 32));

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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

describe("relative times", () => {
  it.each([
    [0, "just now", "just now"],
    [30 * SECOND_MS, "just now", "just now"],
    [-30 * SECOND_MS, "just now", "just now"],
    [MINUTE_MS, "1m ago", "1 minute ago"],
    [5 * MINUTE_MS, "5m ago", "5 minutes ago"],
    [HOUR_MS, "1h ago", "1 hour ago"],
    [3 * HOUR_MS + 59 * MINUTE_MS, "3h ago", "3 hours ago"],
    [DAY_MS, "1d ago", "1 day ago"],
    [3 * DAY_MS, "3d ago", "3 days ago"],
    [29 * DAY_MS, "29d ago", "29 days ago"],
    [31 * DAY_MS, "1mo ago", "1 month ago"],
    [62 * DAY_MS, "2mo ago", "2 months ago"],
    [366 * DAY_MS, "1y ago", "1 year ago"],
    [800 * DAY_MS, "2y ago", "2 years ago"],
    [-5 * MINUTE_MS, "in 5m", "in 5 minutes"],
    [-2 * HOUR_MS, "in 2h", "in 2 hours"],
    [-DAY_MS, "in 1d", "in 1 day"],
    [-45 * DAY_MS, "in 1mo", "in 1 month"],
    [-400 * DAY_MS, "in 1y", "in 1 year"],
  ])("%i ms ago", (elapsedMs, short, long) => {
    const date = NOW.getTime() - elapsedMs;
    expect(timeAgoFrom(date)).toBe(short);
    expect(timeAgoFrom(date, { useLongFormat: true })).toBe(long);
    expect(formatRelativeTime(date)).toBe(long);
    expect(formatRelativeTime(new Date(date))).toBe(long);
  });

  it("measures from the given reference instant", () => {
    const now = new Date(NOW.getTime() + 2 * DAY_MS);
    expect(formatRelativeTime(NOW, now)).toBe("2 days ago");
  });

  it("renders an invalid date instead of throwing", () => {
    expect(formatRelativeTime(Number.NaN)).toBe("Invalid date");
    expect(formatRelativeTime(new Date(Number.NaN))).toBe("Invalid date");
    expect(timeAgoFrom(Number.NaN)).toBe("Invalid date");
  });

  it("formats in the UI locale", async () => {
    await activateUiLocale("fr-FR");
    expect(timeAgoFrom(NOW.getTime() - 3 * DAY_MS)).toBe("il y a 3\u00a0j");
    expect(formatRelativeTime(NOW.getTime() - 3 * DAY_MS)).toBe(
      "il y a 3 jours"
    );
    expect(formatRelativeTime(NOW.getTime() + 2 * HOUR_MS)).toBe(
      "dans 2 heures"
    );
    expect(formatRelativeTime(NOW)).toBe("à l’instant");
  });

  it("uses the en-GB short form", async () => {
    await activateUiLocale("en-GB");
    expect(timeAgoFrom(NOW.getTime() - 3 * HOUR_MS)).toBe("3 hr ago");
  });

  it("ignores the format locale", () => {
    setFormatLocale("fr-FR");
    expect(formatRelativeTime(NOW.getTime() - 3 * DAY_MS)).toBe("3 days ago");
  });
});
