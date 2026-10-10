import { matchBrowserLocale, matchSupportedLocale } from "@app/types/locale";
import { describe, expect, it } from "vitest";

describe("matchSupportedLocale", () => {
  it("returns the supported locale equal to the locale, ignoring case", () => {
    expect(matchSupportedLocale("en-GB")).toBe("en-GB");
    expect(matchSupportedLocale("fr-fr")).toBe("fr-FR");
  });

  it("falls back to the first supported locale of the same language", () => {
    expect(matchSupportedLocale("fr-CA")).toBe("fr-FR");
    expect(matchSupportedLocale("fr")).toBe("fr-FR");
    expect(matchSupportedLocale("en-AU")).toBe("en-US");
  });

  it("returns null when no supported locale has the language", () => {
    expect(matchSupportedLocale("de-DE")).toBeNull();
  });
});

describe("matchBrowserLocale", () => {
  it("returns the match of the first language that has one", () => {
    expect(matchBrowserLocale(["de-DE", "fr-CA", "en-GB"])).toBe("fr-FR");
  });

  it("returns null when no language has a match", () => {
    expect(matchBrowserLocale(["de-DE", "es"])).toBeNull();
    expect(matchBrowserLocale([])).toBeNull();
  });
});
