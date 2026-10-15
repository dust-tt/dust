import { resolveWorkspaceLocale } from "@connectors/lib/bot/workspace_locale";
import { describe, expect, it } from "vitest";

describe("resolveWorkspaceLocale", () => {
  it("uses the workspace locale over the locale the user chose in Dust", () => {
    expect(
      resolveWorkspaceLocale({
        localisationEnabled: true,
        userLocale: "en-GB",
        workspaceLocale: "fr-FR",
      })
    ).toBe("fr-FR");
  });

  it("renders en-US when the workspace locale is not supported", () => {
    expect(
      resolveWorkspaceLocale({
        localisationEnabled: true,
        userLocale: "fr-FR",
        workspaceLocale: "ja-JP",
      })
    ).toBe("en-US");
  });

  it("renders en-US when the Dust locales are unknown", () => {
    expect(resolveWorkspaceLocale(null)).toBe("en-US");
  });
});
