import PO from "pofile";

/**
 * Placeholder translation used by the proof of concept. A real implementation calls an LLM with
 * the glossary and style guide; the contract on `fillMissingTranslations` is what matters.
 */
export function placeholderTranslation(locale: string, msgid: string): string {
  return `[${locale}] ${msgid}`;
}

/**
 * Fills empty translations of a PO catalog and returns the new catalog text.
 *
 * @cc [owner:sfriquet,label:product] fill-never-overwrites-existing-translations
 * An entry whose `msgstr` is non-empty MUST be returned unchanged, whatever its flags. Only
 * entries with an empty `msgstr` (and not marked obsolete) MUST receive a translation.
 */
export function fillMissingTranslations({
  poText,
  locale,
  translate = placeholderTranslation,
}: {
  poText: string;
  locale: string;
  translate?: (locale: string, msgid: string) => string;
}): { poText: string; filled: number } {
  const po = PO.parse(poText);
  let filled = 0;
  for (const item of po.items) {
    if (item.obsolete || item.msgstr.some((s) => s.length > 0)) {
      continue;
    }
    item.msgstr = [translate(locale, item.msgid)];
    filled += 1;
  }
  return { poText: po.toString(), filled };
}

/** Returns the `msgid`s of entries that still have no translation. */
export function listMissingTranslations(poText: string): string[] {
  const po = PO.parse(poText);
  return po.items
    .filter((item) => !item.obsolete && !item.msgstr.some((s) => s.length > 0))
    .map((item) => item.msgid);
}
