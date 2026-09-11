export const SUPPORTED_LOCALES = ["en", "fr"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

// User metadata key holding the UI locale preference (see `UserMetadataModel`).
export const LOCALE_METADATA_KEY = "locale";

// Native language names, shown in the language picker. Deliberately not translated: a user who
// cannot read the current UI language must still recognize their own.
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: "English",
  fr: "Français",
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    SUPPORTED_LOCALES.some((locale) => locale === value)
  );
}

/**
 * @cc [owner:sfriquet,label:product] locale-fallback-to-english
 * The resolved UI locale MUST be the stored preference when it is one of `SUPPORTED_LOCALES`,
 * and MUST be `DEFAULT_LOCALE` (`en`) in every other case: no preference stored, preference
 * still loading, or a value that is not a supported locale.
 */
export function resolveLocale(storedValue: unknown): SupportedLocale {
  return isSupportedLocale(storedValue) ? storedValue : DEFAULT_LOCALE;
}
