import {
  fillMissingTranslations,
  listMissingTranslations,
} from "@app/scripts/i18n/fill";
import { describe, expect, it } from "vitest";

const HEADER = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=utf-8\\n"
"Language: fr\\n"
`;

const CATALOG = `${HEADER}
#: front/components/UserMenu.tsx
msgid "Sign out"
msgstr ""

#: front/components/UserMenu.tsx
msgid "Help"
msgstr "Aide"

#~ msgid "Old string"
#~ msgstr ""
`;

describe("fillMissingTranslations", () => {
  it("fills only empty, non-obsolete entries and keeps existing translations", () => {
    const { poText, filled } = fillMissingTranslations({
      poText: CATALOG,
      locale: "fr",
    });
    expect(filled).toBe(1);
    expect(poText).toContain('msgid "Sign out"\nmsgstr "[fr] Sign out"');
    expect(poText).toContain('msgid "Help"\nmsgstr "Aide"');
    expect(poText).toContain('#~ msgstr ""');
    expect(listMissingTranslations(poText)).toEqual([]);
  });

  it("is idempotent", () => {
    const once = fillMissingTranslations({ poText: CATALOG, locale: "fr" });
    const twice = fillMissingTranslations({
      poText: once.poText,
      locale: "fr",
    });
    expect(twice.filled).toBe(0);
    expect(twice.poText).toBe(once.poText);
  });

  it("lists missing translations", () => {
    expect(listMissingTranslations(CATALOG)).toEqual(["Sign out"]);
  });
});
