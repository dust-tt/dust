import { resolveBrowserLocale } from "@app/lib/i18n/browser_locale";
import { describe, expect, it } from "vitest";

describe("resolveBrowserLocale", () => {
  it("matches a supported locale ignoring case", () => {
    expect(resolveBrowserLocale(["en-gb"])).toBe("en-GB");
  });

  it("matches the first supported locale of the same language", () => {
    expect(resolveBrowserLocale(["fr-CA"])).toBe("fr-FR");
    expect(resolveBrowserLocale(["fr"])).toBe("fr-FR");
    expect(resolveBrowserLocale(["en-AU"])).toBe("en-US");
  });

  it("uses the first browser language with a match", () => {
    expect(resolveBrowserLocale(["de-DE", "fr-BE", "en-GB"])).toBe("fr-FR");
  });

  it("falls back to the default locale", () => {
    expect(resolveBrowserLocale(["de-DE", "ja"])).toBe("en-US");
    expect(resolveBrowserLocale([])).toBe("en-US");
  });
});
