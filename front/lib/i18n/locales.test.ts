import { resolveLocale } from "@app/lib/i18n/locales";
import { describe, expect, it } from "vitest";

describe("resolveLocale", () => {
  it("returns a supported stored locale", () => {
    expect(resolveLocale("fr")).toBe("fr");
    expect(resolveLocale("en")).toBe("en");
  });

  it("falls back to English for missing or unsupported values", () => {
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale("")).toBe("en");
    expect(resolveLocale("de")).toBe("en");
    expect(resolveLocale("fr-FR")).toBe("en");
    expect(resolveLocale(42)).toBe("en");
  });
});
