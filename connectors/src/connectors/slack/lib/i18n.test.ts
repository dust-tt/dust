import { getSlackI18n } from "@connectors/connectors/slack/lib/i18n";
import { SUPPORTED_LOCALES } from "@connectors/types/locale";
import { describe, expect, it } from "vitest";

describe("getSlackI18n", () => {
  it("loads every supported locale", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const i18n = await getSlackI18n(locale);
      expect(i18n.locale).toBe(locale);
    }
  });

  // Instances are not named `i18n` here: `lingui extract` would collect the test messages in
  // checkouts whose path contains a dot directory, where the `*.test.ts` exclusion does not match.
  it("renders the English text with interpolated placeholders in en-US", async () => {
    const en = await getSlackI18n("en-US");
    expect(
      en._("Answered by *{assistantName}*", { assistantName: "Dust" })
    ).toBe("Answered by *Dust*");
  });

  it("falls back to the English text for messages missing from the catalog", async () => {
    const fr = await getSlackI18n("fr-FR");
    expect(fr._("Not in any catalog, {name}", { name: "Ada" })).toBe(
      "Not in any catalog, Ada"
    );
  });

  it("keeps one instance per locale", async () => {
    const [en, fr] = await Promise.all([
      getSlackI18n("en-US"),
      getSlackI18n("fr-FR"),
    ]);
    expect(await getSlackI18n("en-US")).toBe(en);
    expect(en.locale).toBe("en-US");
    expect(fr.locale).toBe("fr-FR");
  });
});
