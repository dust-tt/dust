import type { SupportedLocale } from "@app/types/locale";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@app/types/locale";

function getLanguage(locale: string): string {
  return locale.split("-")[0].toLowerCase();
}

/**
 * @cc [owner:sfriquet,label:product] first-matching-browser-language
 * The result MUST be the `SupportedLocale` matching the first entry of `languages` that matches
 * one: an entry matches the `SupportedLocale` equal to it ignoring case, otherwise the first of
 * `SUPPORTED_LOCALES` with the same language subtag. It MUST be `DEFAULT_LOCALE` when no entry
 * matches.
 */
export function resolveBrowserLocale(
  languages: readonly string[]
): SupportedLocale {
  for (const language of languages) {
    const exactMatch = SUPPORTED_LOCALES.find(
      (locale) => locale.toLowerCase() === language.toLowerCase()
    );
    const languageMatch = SUPPORTED_LOCALES.find(
      (locale) => getLanguage(locale) === getLanguage(language)
    );
    const match = exactMatch ?? languageMatch;
    if (match) {
      return match;
    }
  }
  return DEFAULT_LOCALE;
}
