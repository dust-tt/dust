import { resolveVizLocale } from "@viz/app/lib/i18n/resolveVizLocale";
import { describe, expect, it } from "vitest";

describe("resolveVizLocale", () => {
  it("prefers the locale param over Accept-Language", () => {
    expect(
      resolveVizLocale({ localeParam: "fr-FR", acceptLanguage: "en-US" })
    ).toBe("fr-FR");
  });

  it("maps a supported locale without catalog to its language's catalog", () => {
    expect(
      resolveVizLocale({ localeParam: "en-AU", acceptLanguage: "fr-FR" })
    ).toBe("en-US");
  });

  it("falls back to Accept-Language when the param is missing or unsupported", () => {
    expect(
      resolveVizLocale({ localeParam: undefined, acceptLanguage: "fr-FR" })
    ).toBe("fr-FR");
    expect(
      resolveVizLocale({ localeParam: "es-ES", acceptLanguage: "fr" })
    ).toBe("fr-FR");
  });

  it("uses the first Accept-Language tag that has a catalog", () => {
    expect(
      resolveVizLocale({
        localeParam: undefined,
        acceptLanguage: "es-ES,fr-CA;q=0.8,en;q=0.5",
      })
    ).toBe("fr-FR");
  });

  it("ignores wildcard tags", () => {
    expect(
      resolveVizLocale({ localeParam: undefined, acceptLanguage: "*,fr;q=0.1" })
    ).toBe("fr-FR");
  });

  it("matches tags case-insensitively", () => {
    expect(
      resolveVizLocale({ localeParam: "FR-fr", acceptLanguage: null })
    ).toBe("fr-FR");
  });

  it("falls back to the source locale", () => {
    expect(
      resolveVizLocale({ localeParam: undefined, acceptLanguage: null })
    ).toBe("en-US");
    expect(
      resolveVizLocale({ localeParam: "", acceptLanguage: "es-ES, ja" })
    ).toBe("en-US");
  });
});
