import { resolveSlackLocale } from "@connectors/connectors/slack/lib/user_locale";
import { describe, expect, it } from "vitest";

const dustLocales = {
  localisationEnabled: true,
  userLocale: null,
  workspaceLocale: "en-US",
};

describe("resolveSlackLocale", () => {
  it("prefers the locale chosen in Dust over the Slack locale", () => {
    expect(
      resolveSlackLocale({
        dustLocales: { ...dustLocales, userLocale: "fr-FR" },
        slackLocale: "en-GB",
      })
    ).toBe("fr-FR");
  });

  it("falls back to the Slack locale when the user chose none in Dust", () => {
    expect(resolveSlackLocale({ dustLocales, slackLocale: "fr-FR" })).toBe(
      "fr-FR"
    );
  });

  it("skips locales that are not supported locales", () => {
    expect(resolveSlackLocale({ dustLocales, slackLocale: "fr-CA" })).toBe(
      "en-US"
    );
  });

  it("falls back to the workspace locale when the Slack locale is not supported", () => {
    expect(
      resolveSlackLocale({
        dustLocales: { ...dustLocales, workspaceLocale: "fr-FR" },
        slackLocale: "ja-JP",
      })
    ).toBe("fr-FR");
  });

  it("uses the workspace locale without Slack locale", () => {
    expect(
      resolveSlackLocale({
        dustLocales: { ...dustLocales, workspaceLocale: "fr-FR" },
        slackLocale: undefined,
      })
    ).toBe("fr-FR");
  });

  it("renders en-US when localisation is disabled", () => {
    expect(
      resolveSlackLocale({
        dustLocales: {
          localisationEnabled: false,
          userLocale: "fr-FR",
          workspaceLocale: "fr-FR",
        },
        slackLocale: "fr-FR",
      })
    ).toBe("en-US");
  });

  it("renders en-US when the Dust locales are unknown", () => {
    expect(
      resolveSlackLocale({ dustLocales: null, slackLocale: "fr-FR" })
    ).toBe("en-US");
  });
});
