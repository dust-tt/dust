import { getBotI18n } from "@connectors/lib/bot/i18n";
import { SUPPORTED_LOCALES } from "@connectors/types/locale";
import { describe, expect, it } from "vitest";

describe("getBotI18n", () => {
  it("loads every supported locale", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const i18n = await getBotI18n(locale);
      expect(i18n.locale).toBe(locale);
    }
  });

  // Instances are not named `i18n` here: `lingui extract` would collect the test messages in
  // checkouts whose path contains a dot directory, where the `*.test.ts` exclusion does not match.
  it("renders the English text with interpolated placeholders in en-US", async () => {
    const en = await getBotI18n("en-US");
    expect(
      en._("Answered by *{assistantName}*", { assistantName: "Dust" })
    ).toBe("Answered by *Dust*");
  });

  it("renders translations in fr-FR", async () => {
    const fr = await getBotI18n("fr-FR");
    expect(
      fr._("Answered by *{assistantName}*", { assistantName: "Dust" })
    ).toBe("Réponse de *Dust*");
  });

  it("renders the English text in en-GB where the catalog has no translation", async () => {
    const enGb = await getBotI18n("en-GB");
    expect(
      enGb._("Answered by *{assistantName}*", { assistantName: "Dust" })
    ).toBe("Answered by *Dust*");
  });

  it("renders the en-GB translation where the catalog has one", async () => {
    const enGb = await getBotI18n("en-GB");
    expect(enGb._("Message generation was canceled.")).toBe(
      "Message generation was cancelled."
    );
  });

  it("falls back to the English text for messages missing from the catalog", async () => {
    const fr = await getBotI18n("fr-FR");
    expect(fr._("Not in any catalog, {name}", { name: "Ada" })).toBe(
      "Not in any catalog, Ada"
    );
  });

  it("keeps one instance per locale", async () => {
    const [en, fr] = await Promise.all([
      getBotI18n("en-US"),
      getBotI18n("fr-FR"),
    ]);
    expect(await getBotI18n("en-US")).toBe(en);
    expect(en.locale).toBe("en-US");
    expect(fr.locale).toBe("fr-FR");
  });
});
