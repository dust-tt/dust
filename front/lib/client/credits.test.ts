import { setFormatLocale } from "@app/lib/i18n/format";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAvgCredits, formatRelativeResetDay } from "./credits";

describe("formatAvgCredits", () => {
  it.each([
    [310, "310.0"],
    [46.12, "46.1"],
    [1748.95, "1,749.0"],
    [0, "0.0"],
  ])("formats %s with exactly one decimal", (credits, expected) => {
    expect(formatAvgCredits(credits)).toBe(expected);
  });
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
    ["2025-09-22T10:00:00Z", "today"],
    ["2025-09-23T00:00:00Z", "today"],
    ["2025-09-24T00:30:00Z", "tomorrow"],
    ["2025-09-25T12:00:00Z", "on Thursday"],
    ["2025-09-29T12:00:00Z", "on Monday"],
    ["2025-09-30T12:00:00Z", "on Sep 30"],
    ["2025-10-06T12:00:00Z", "on Oct 6"],
  ])("labels %s as %s", (isoDate, expected) => {
    expect(formatRelativeResetDay(isoDate)).toBe(expected);
  });

  it("formats in the UI locale, not the format locale", async () => {
    setFormatLocale("fr-FR");
    expect(formatRelativeResetDay("2025-09-24T00:30:00Z")).toBe("tomorrow");

    i18n.loadAndActivate({
      locale: "fr-FR",
      messages: await loadCatalog("fr-FR"),
    });
    expect(formatRelativeResetDay("2025-09-23T12:00:00Z")).toBe("aujourd’hui");
    expect(formatRelativeResetDay("2025-09-24T00:30:00Z")).toBe("demain");
    expect(formatRelativeResetDay("2025-09-25T12:00:00Z")).toBe("on jeudi");
  });
});
