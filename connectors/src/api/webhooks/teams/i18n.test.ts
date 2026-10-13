import { describe, expect, it } from "vitest";

import { resolveTeamsLocale } from "./i18n";

const dustLocales = {
  localisationEnabled: true,
  userLocale: null,
  workspaceLocale: "fr-FR",
};

describe("resolveTeamsLocale", () => {
  it("uses the workspace locale", () => {
    expect(resolveTeamsLocale(dustLocales)).toBe("fr-FR");
  });

  it("ignores the locale the member chose in Dust", () => {
    expect(
      resolveTeamsLocale({
        ...dustLocales,
        userLocale: "en-GB",
        workspaceLocale: "en-US",
      })
    ).toBe("en-US");
  });

  it("uses the default locale while localisation is disabled", () => {
    expect(
      resolveTeamsLocale({ ...dustLocales, localisationEnabled: false })
    ).toBe("en-US");
  });

  it("uses the default locale for an unsupported workspace locale", () => {
    expect(
      resolveTeamsLocale({ ...dustLocales, workspaceLocale: "ja-JP" })
    ).toBe("en-US");
  });

  it("uses the default locale when the Dust lookup failed", () => {
    expect(resolveTeamsLocale(null)).toBe("en-US");
  });
});
