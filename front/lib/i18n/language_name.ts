/**
 * @cc [owner:ykmsd,label:coding] language-name-never-throws
 * MUST return the name of the language, written in English (e.g. "fr" -> "French", "pt-BR" ->
 * "Brazilian Portuguese"), and the input unchanged when it has no known name or is not a valid
 * language tag.
 * MUST NOT throw.
 */
export function getLanguageName(languageCode: string): string {
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(languageCode) ??
      languageCode
    );
  } catch {
    return languageCode;
  }
}
