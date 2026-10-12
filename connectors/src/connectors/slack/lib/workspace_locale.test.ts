import { resolveSlackLocale } from "@connectors/connectors/slack/lib/workspace_locale";
import { describe, expect, it } from "vitest";

describe("resolveSlackLocale", () => {
  it("uses the workspace locale over the locale the user chose in Dust", () => {
    expect(
      resolveSlackLocale({
        localisationEnabled: true,
        userLocale: "en-GB",
        workspaceLocale: "fr-FR",
      })
    ).toBe("fr-FR");
  });

  it("renders en-US when the workspace locale is not supported", () => {
    expect(
      resolveSlackLocale({
        localisationEnabled: true,
        userLocale: "fr-FR",
        workspaceLocale: "ja-JP",
      })
    ).toBe("en-US");
  });

  it("renders en-US when localisation is disabled", () => {
    expect(
      resolveSlackLocale({
        localisationEnabled: false,
        userLocale: "fr-FR",
        workspaceLocale: "fr-FR",
      })
    ).toBe("en-US");
  });

  it("renders en-US when the Dust locales are unknown", () => {
    expect(resolveSlackLocale(null)).toBe("en-US");
  });
});
