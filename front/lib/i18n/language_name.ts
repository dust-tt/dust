const ENGLISH_LANGUAGE_NAMES = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "none",
});

/**
 * @cc [owner:ykmsd,label:coding] language-name-never-throws
 * MUST return the name of the language, written in English (e.g. "fr" -> "French", "de" ->
 * "German"), and null when it has no known name or is not a valid language tag.
 * MUST NOT throw.
 */
export function getLanguageName(languageCode: string): string | null {
  try {
    return ENGLISH_LANGUAGE_NAMES.of(languageCode) ?? null;
  } catch {
    return null;
  }
}
