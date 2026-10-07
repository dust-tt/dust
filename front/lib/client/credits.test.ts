import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import type { MessageDescriptor } from "@lingui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatAvgCredits,
  formatAvgCreditValue,
  formatRelativeResetDay,
} from "./credits";

const translate = (descriptor: MessageDescriptor) => i18n._(descriptor);

describe("formatAvgCredits", () => {
  beforeEach(() => {
    setFormatLocale("en-US");
  });

  afterEach(() => {
    setFormatLocale(undefined);
  });

  it.each([
    [310, "310.0"],
    [46.12, "46.1"],
    [1748.95, "1,749.0"],
    [0, "0.0"],
  ])("formats %s with exactly one decimal", (credits, expected) => {
    expect(formatAvgCredits(credits)).toBe(expected);
  });
});

describe("formatAvgCreditValue", () => {
  afterEach(() => {
    setFormatLocale(undefined);
  });

  it.each([
    ["en-US", [0.2, 1.46, 2], ["0.2 credits", "1.5 credits", "2.0 credits"]],
    ["fr-FR", [0.2, 1.46, 2], ["0,2 crédit", "1,5 crédit", "2,0 crédits"]],
  ] as const)(
    "formats with one decimal and pluralizes on the displayed value in %s",
    async (locale, credits, expected) => {
      setFormatLocale(locale);
      i18n.loadAndActivate({ locale, messages: await loadCatalog(locale) });
      expect(credits.map((c) => formatAvgCreditValue(c, translate))).toEqual(
        expected
      );
    }
  );
});

describe("formatRelativeResetDay", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    // Tue 2025-09-23 23:30 UTC.
    vi.setSystemTime(new Date("2025-09-23T23:30:00Z"));
    i18n.loadAndActivate({
      locale: "en-US",
      messages: await loadCatalog("en-US"),
    });
  });

  afterEach(() => {
    setFormatLocale(undefined);
    vi.useRealTimers();
  });

  it.each([
    ["2025-09-22T10:00:00Z", "relative", "today"],
    ["2025-09-23T00:00:00Z", "relative", "today"],
    ["2025-09-24T00:30:00Z", "relative", "tomorrow"],
    ["2025-09-25T12:00:00Z", "weekday", "Thursday"],
    ["2025-09-29T12:00:00Z", "weekday", "Monday"],
    ["2025-09-30T12:00:00Z", "date", "Sep 30"],
    ["2025-10-06T12:00:00Z", "date", "Oct 6"],
  ])("labels %s as %s %s", (isoDate, kind, day) => {
    expect(formatRelativeResetDay(isoDate)).toEqual({ kind, day });
  });

  it("formats in the UI locale, not the format locale", async () => {
    setFormatLocale("fr-FR");
    expect(formatRelativeResetDay("2025-09-24T00:30:00Z").day).toBe("tomorrow");

    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadCatalog("fr-FR"),
    });
    expect(formatRelativeResetDay("2025-09-23T12:00:00Z").day).toBe(
      "aujourd’hui"
    );
    expect(formatRelativeResetDay("2025-09-24T00:30:00Z").day).toBe("demain");
    expect(formatRelativeResetDay("2025-09-25T12:00:00Z").day).toBe("jeudi");
  });
});
